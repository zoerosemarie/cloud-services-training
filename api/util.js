const { MongoClient, ObjectId, Db } = require("mongodb")
const { Buffer } = require("buffer")
const urlsafeBase64 = require("urlsafe-base64")
const jsonschema = require("jsonschema")
const readYAML = require("read-yaml")

class HTTPError extends Error {
  constructor(status, message) {
    super(message)
    this.name = "HTTPError"
    this.status = status
  }
}

module.exports.HTTPError = HTTPError

/**
 * @param {ObjectId} id
 */
module.exports.idToBase64 = id =>
  urlsafeBase64.encode(Buffer.from(id.toString(), "hex"))

/**
 * @param {string} base64
 */
module.exports.base64ToId = base64 =>
  new ObjectId(urlsafeBase64.decode(base64).toString("hex"))

/**
 * @param {function(Db): Promise<void>} run
 */
module.exports.runWithDB = async run => {
  let db
  try {
    db = await MongoClient.connect(process.env.MONGO_URL)

    await run(db)
  } catch (error) {
    throw error
  } finally {
    if (db) db.close()
  }
}

module.exports.schemas = readYAML.sync("./schemas.yml")

const schemaValidator = new jsonschema.Validator()

schemaValidator.customFormats.urlsafeBase64 = input =>
  urlsafeBase64.validate(input)
schemaValidator.customFormats.objectId = input => ObjectId.isValid(input)

module.exports.validateRequest = (
  request,
  {
    paramSchemaProps = {},
    querySchemaProps = {},
    bodySchema = { type: "object", additionalProperties: false }
  }
) => {
  const paramsResult = schemaValidator.validate(
    request.params,
    {
      type: "object",
      additionalProperties: false,
      properties: paramSchemaProps
    },
    { propertyName: "Path Params" }
  )

  const queryResult = schemaValidator.validate(
    request.query,
    {
      type: "object",
      additionalProperties: false,
      properties: querySchemaProps
    },
    { propertyName: "Query" }
  )

  const bodyResult = schemaValidator.validate(request.body, bodySchema, {
    propertyName: "Body"
  })

  if (!paramsResult.valid || !queryResult.valid || !bodyResult.valid) {
    const errors = [
      ...paramsResult.errors,
      ...queryResult.errors,
      ...bodyResult.errors
    ]

    throw new HTTPError(
      400,
      `Invalid request: ${errors[0].property} ${errors[0].message}`
    )
  }
}
