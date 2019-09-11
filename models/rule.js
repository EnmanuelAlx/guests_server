const mongoose = require("mongoose");
mongoose.Promise = global.Promise;
const Schema = mongoose.Schema;

const RuleSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      maxlength: 100,
    },
  },
  {
    timestamps: { createdAt: "created_at" },
  }
);

RuleSchema.statics.findOneOrCreate = async function findOneOrCreate(
  condition,
  params
) {
  const self = this;
  let u = await self.findOne(condition);
  if (!u) u = await self.create(params);
  await u.save();
  return u;
};

module.exports = mongoose.model("Rule", RuleSchema);
