const mongoose = require("mongoose");
mongoose.Promise = global.Promise;
const Schema = mongoose.Schema;
const Interval = require("./interval.js");
/**
 * @swagger
 * definitions:
 *   Visit:
 *     type: object
 *     description: this model represents the Visits between users
 *     required:
 *       - guest
 *     properties:
 *       id:
 *         type: string
 *         readOnly: true
 *       resident:
 *         type: string
 *         readOnly: true
 *         description: who send the Visit request
 *       guest:
 *         type: string
 *         description: who is Guest
 *       community:
 *         type: string
 *         description: the Id Of the comunity
 *       dayOfVisit:
 *         type: string
 *         format: date
 *         description: Day of Visit!
  *       limit:
 *         type: string
 *         format: date
 *         description: The limit of the Visit could be valid to get in into a community
 *       kind:
 *         type: string
 *         description: the type of visit
 *         enum: [SCHEDULED, FREQUENT, NOT EXPECTED, SPORADIC]
 *       companions:
 *         type: integer
 *         description: how many people came with the guest.
 *       partOfDay:
 *         type: string
 *         enum: [MORNING, AFTERNOON, NIGHT]
 *       timezone:
 *         type: string
 *         description: the timezone of the visit!
 *       token:
 *         type: string
 *         description: the Identifier Token of the Visit. 
 *       intervals:
 *         type: array
 *         items:
 *           schema:
 *              $ref: '#/definitions/Interval'
 */

const VISIT_KIND = ["SCHEDULED", "FREQUENT", "NOT EXPECTED", "SPORADIC"];
const PART_OF_DAYS = ["MORNING", "AFTERNOON", "NIGHT", "ALL DAY"];
const GUEST_TYPE_ENUM = ["User", "Company"];
const VisitSchema = new Schema(
  {
    resident: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    guest: {
      type: Schema.Types.ObjectId,
      refPath: "guestType",
      required: true
    },
    community: {
      type: Schema.Types.ObjectId,
      ref: "Community",
      required: true
    },
    dayOfVisit: { type: Date, fake: "date.future" },
    limit: { type: Date, fake: "date.future" },
    partOfDay: { type: String, enum: PART_OF_DAYS, default: "AFTERNOON" },
    creator: {
      type: Schema.Types.ObjectId,
      refPath: "guestType"
    },
    intervals: [Interval],
    kind: {
      type: String,
      default: "SCHEDULED",
      enum: VISIT_KIND,
      required: true
    },
    guestType: {
      type: String,
      default: "User",
      enum: GUEST_TYPE_ENUM,
      required: true
    },
    timezone: {
      type: String,
      required: true,
      default: "America/Bogota"
    },
    note: {
      type: String,
      required: false,
      default : ''
    },
    token: {
      type: String,
      fake: "random.alphaNumeric"
    },
    images: [String]
  },
  {
    timestamps: { createdAt: "created_at" },
    fakeCreatedAt: { from: "01-01-2018", to: "12-31-2018" },
    toObject: { virtuals: true },
    toJSON: { virtuals: true }
  }
);

VisitSchema.statics.residentSelector =
  "guest community dayOfVisit intervals kind guestType partOfDay token limit";

module.exports = mongoose.model("Visit", VisitSchema);
