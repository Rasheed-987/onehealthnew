import { Schema, model, models, type Model, type Types } from "mongoose";
import {
  NOTIFICATION_AUDIENCE,
  NOTIFICATION_MAX_LENGTH,
  NOTIFICATION_ROLE_TARGET,
  NOTIFICATION_TITLE_MAX_LENGTH,
  type NotificationAudienceKind,
  type NotificationRoleTarget,
} from "./enums";

/**
 * An announcement the school pushes out. Written by the super admin only.
 *
 * The whole design lives in `audience`. See NOTIFICATION_AUDIENCE in enums.ts
 * for why it is a rule (`kind` plus the one list that kind uses) rather than a
 * resolved set of recipient ids, and `resolveNotificationScope` for the read
 * half that turns it back into a Mongo filter.
 *
 * Contrast with GalleryItem, which does the opposite and expands a classroom
 * to explicit student tags at write time. That is right there and wrong here:
 * a photo is OF named children, so its audience is intrinsic and must not
 * drift, whereas "the nursery is closed on Friday" is addressed to whoever is
 * in the room on Friday.
 */
export interface INotificationAudience {
  kind: NotificationAudienceKind;
  /** ROLE only. */
  roles: NotificationRoleTarget[];
  /** CLASSROOM only. */
  classrooms: Types.ObjectId[];
  /** STUDENT only - reaches the guardians of these children. */
  students: Types.ObjectId[];
}

export interface INotification {
  _id: Types.ObjectId;
  /** Optional headline. The body alone is a complete notice. */
  title?: string;
  body: string;
  audience: INotificationAudience;
  /** Soft delete, so a notice pulled by mistake can be put back. */
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationAudienceSchema = new Schema<INotificationAudience>(
  {
    kind: {
      type: String,
      enum: Object.values(NOTIFICATION_AUDIENCE),
      required: true,
    },
    roles: {
      type: [{ type: String, enum: NOTIFICATION_ROLE_TARGET }],
      default: [],
    },
    classrooms: {
      type: [{ type: Schema.Types.ObjectId, ref: "Classroom" }],
      default: [],
    },
    students: {
      type: [{ type: Schema.Types.ObjectId, ref: "Student" }],
      default: [],
    },
  },
  { _id: false },
);

const NotificationSchema = new Schema<INotification>(
  {
    title: {
      type: String,
      trim: true,
      maxlength: [
        NOTIFICATION_TITLE_MAX_LENGTH,
        `Keep the headline under ${NOTIFICATION_TITLE_MAX_LENGTH} characters.`,
      ],
    },
    body: {
      type: String,
      required: [true, "Write the notification."],
      trim: true,
      maxlength: [
        NOTIFICATION_MAX_LENGTH,
        `Keep the notification under ${NOTIFICATION_MAX_LENGTH} characters.`,
      ],
    },
    audience: { type: NotificationAudienceSchema, required: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

/*
 * The reader's query is an `$or` over the four kinds - see
 * `resolveNotificationScope` - so each arm gets the index it needs. The
 * trailing `createdAt` is what keeps "newest first" from being a sort in
 * memory once a school has a few years of announcements.
 */
NotificationSchema.index({ "audience.kind": 1, isActive: 1, createdAt: -1 });
NotificationSchema.index({ "audience.roles": 1, isActive: 1, createdAt: -1 });
NotificationSchema.index({
  "audience.classrooms": 1,
  isActive: 1,
  createdAt: -1,
});
NotificationSchema.index({ "audience.students": 1, isActive: 1, createdAt: -1 });
// The admin's own table, which is unfiltered.
NotificationSchema.index({ createdAt: -1 });

/**
 * One kind, one list, and nothing left over.
 *
 * The read filter branches on `kind` and looks at exactly one of the three
 * arrays, so a leftover selection in either of the other two would be dead
 * data that nothing enforces and nobody can see - until the day someone
 * changes the filter and it silently becomes an audience. An admin who picks
 * three rooms and then switches to "All parents" must not still be carrying
 * those rooms, so the rule is enforced at write time rather than trusted to
 * the form.
 */
NotificationSchema.pre("validate", function () {
  const { kind, roles, classrooms, students } = this.audience;

  const lists = {
    [NOTIFICATION_AUDIENCE.ROLE]: { path: "audience.roles", value: roles },
    [NOTIFICATION_AUDIENCE.CLASSROOM]: {
      path: "audience.classrooms",
      value: classrooms,
    },
    [NOTIFICATION_AUDIENCE.STUDENT]: {
      path: "audience.students",
      value: students,
    },
  } as const;

  for (const [forKind, list] of Object.entries(lists)) {
    if (forKind === kind) {
      if (list.value.length === 0) {
        this.invalidate(list.path, "Choose at least one to send this to.");
      }
      const seen = list.value.map(String);
      if (new Set(seen).size !== seen.length) {
        this.invalidate(list.path, "The same target is listed twice.");
      }
    } else if (list.value.length > 0) {
      // Not a message anyone will read - the form cannot produce it - but the
      // one that stops a stale selection surviving a change of mind.
      this.invalidate(
        list.path,
        "This does not belong to the audience that was chosen.",
      );
    }
  }
});

export const Notification =
  (models.Notification as Model<INotification>) ??
  model<INotification>("Notification", NotificationSchema);
