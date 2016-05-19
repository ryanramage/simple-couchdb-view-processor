var Joi = require('joi')
var schema = Joi.object().keys({
  name: Joi.string().required(),
  view: Joi.string().required(),
  concurrency: Joi.number(),
  timeout: Joi.number(),
  checkpoint_size: Joi.number(),
  bucket: Joi.object().keys({
    start: Joi.string(),
    end: Joi.string()
  })
}).unknown(true)

module.exports = function (config, cb) {
  return Joi.validate(config, schema)
}
