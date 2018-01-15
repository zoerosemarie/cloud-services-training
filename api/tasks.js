const { Router } = require("express")

const {
  runWithDB,
  validateRequest,
  base64ToId,
  idToBase64,
  schemas,
  HTTPError
} = require("./util")

module.exports = Router()
  .get("/", (request, response) =>
    runWithDB(async db => {
      validateRequest(request, {
        querySchemaProps: {
          pageSize: { type: "string", pattern: "^\\d+$" },
          pageToken: { type: "string", format: "urlsafeBase64" }
        }
      })

      const tasksCollection = db.collection("tasks")

      /** @type {number} */ const pageSize = +request.query.pageSize || 10
      /** @type {string} */ const pageToken = request.query.pageToken || null

      const allTasks = pageToken
        ? tasksCollection.find({ _id: { $gte: base64ToId(pageToken) } })
        : tasksCollection.find()

      const readTasks = await allTasks
        .sort("_id", -1)
        .limit(pageSize + 1)
        .toArray()
      const items = readTasks.slice(0, pageSize)
      const nextPageFirstTask = readTasks[pageSize]
      const nextPageToken = nextPageFirstTask
        ? idToBase64(nextPageFirstTask._id)
        : null

      response.status(200).send({ items, nextPageToken })
    })
  )

  .post("/", (request, response) =>
    runWithDB(async db => {
      validateRequest(request, {
        bodySchema: schemas.TaskCreate
      })

      const newTask = {
        ...request.body,
        isComplete: false
      }

      const tasksCollection = db.collection("tasks")
      const insertResult = await tasksCollection.insertOne(newTask)

      if (!insertResult.result.ok) {
        throw new Error("Couldn't add to database")
      }

      response.status(201).send({ item: newTask })
    })
  )

  .patch("/:taskId", (request, response) =>
    runWithDB(async db => {
      validateRequest(request, {
        paramSchemaProps: {
          taskId: { type: "string", format: "objectID" }
        },
        bodySchema: schemas.TaskEdit
      })

      const tasksCollection = db.collection("tasks")

      const { taskId } = request.params
      const updateResult = await tasksCollection.updateOne(
        { _id: new ObjectID(taskId) },
        { $set: request.body }
      )

      if (updateResult.matchedCount < 1) {
        throw new HTTPError(404, `No task with id "${taskId}"`)
      } else if (!updateResult.result.ok) {
        throw new Error("Couldn't update database")
      } else {
        response.status(204).send()
      }
    })
  )

  .delete("/:taskId", (request, response) =>
    runWithDB(async db => {
      validateRequest(request, {
        paramSchemaProps: {
          taskId: { type: "string", format: "objectID" }
        }
      })

      const tasksCollection = db.collection("tasks")

      const { taskId } = request.params
      const deleteResult = await tasksCollection.findOneAndDelete({
        _id: new ObjectID(taskId)
      })

      if (!deleteResult.value) {
        throw new HTTPError(404, `No task with id "${taskId}"`)
      } else if (!deleteResult.ok) {
        throw new Error("Couldn't update database")
      } else {
        response.status(200).send({ item: deleteResult.value })
      }
    })
  )
