const mongoose = require("mongoose");
mongoose.Promise = global.Promise;
const Schema = mongoose.Schema;

const CommunityRuleSchema = new Schema(
  {
    community: {
      type: Schema.Types.ObjectId,
      ref: "Community",
      required: true
    },
    rule: {
      type: Schema.Types.ObjectId,
      ref: "Rule",
      required: true
    },
  },
  {
    timestamps: { createdAt: "created_at" },
  }
);

module.exports = mongoose.model("CommunityRule", CommunityRuleSchema);
