/*
 * Connect all of your endpoints together here.
 */
module.exports = function (app, router) {
  app.use("/api", require("./home.js")(router));

  const Task = require("../models/task");
  const User = require("../models/user");

  router.get("/tasks", async (req, res) => {
    try {
      let query = {};

      // 'where' param
      if (req.query.where) {
        try {
          query = JSON.parse(req.query.where);
        } catch (e) {
          return res
            .status(400)
            .json({ message: "Invalid JSON in 'where' parameter", data: {} });
        }
      }

      let dbQuery = Task.find(query);

      // 'sort' param
      if (req.query.sort) {
        try {
          dbQuery = dbQuery.sort(JSON.parse(req.query.sort));
        } catch (e) {
          return res
            .status(400)
            .json({ message: "Invalid JSON in 'sort' parameter", data: {} });
        }
      }

      // 'select' param
      if (req.query.select) {
        try {
          dbQuery = dbQuery.select(JSON.parse(req.query.select));
        } catch (e) {
          return res
            .status(400)
            .json({ message: "Invalid JSON in 'select' parameter", data: {} });
        }
      }

      // 'count' param
      if (req.query.count === "true") {
        const count = await Task.countDocuments(query);
        return res.status(200).json({ message: "OK", data: count });
      }

      // 'skip' param
      if (req.query.skip) {
        const skipVal = parseInt(req.query.skip, 10);
        if (!isNaN(skipVal)) dbQuery = dbQuery.skip(skipVal);
      }

      // 'limit' param
      const limitVal = req.query.limit ? parseInt(req.query.limit, 10) : 100;
      if (!isNaN(limitVal)) {
        dbQuery = dbQuery.limit(limitVal);
      }

      const tasks = await dbQuery.exec();
      return res.status(200).json({ message: "OK", data: tasks });
    } catch (e) {
      return res.status(500).json({ message: "Server Error", data: {} });
    }
  });

  router.get("/tasks/:id", async (req, res) => {
    try {
      let dbQuery = Task.findById(req.params.id);

      if (req.query.select) {
        try {
          dbQuery = dbQuery.select(JSON.parse(req.query.select));
        } catch (e) {
          return res
            .status(400)
            .json({ message: "Invalid JSON in select parameter", data: {} });
        }
      }

      const task = await dbQuery.exec();
      if (!task) {
        return res.status(404).json({ message: "Task not found", data: {} });
      }

      return res.status(200).json({ message: "OK", data: task });
    } catch (e) {
      return res
        .status(404)
        .json({ message: "Task not found/invalid ID", data: {} });
    }
  });

  router.put("/users/:id", async (req, res) => {
    try {
      const userId = req.params.id;
      const { name, email, pendingTasks = [] } = req.body;

      // make sure user exists first
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found", data: {} });
      }

      // check required fields
      if (!name || !email) {
        return res
          .status(400)
          .json({ message: "Name and email are required", data: {} });
      }

      const oldPendingTasks = user.pendingTasks || [];
      const newPendingTasks = pendingTasks;
      const removedTasks = oldPendingTasks.filter(
        (taskId) => !newPendingTasks.includes(taskId),
      );
      await Task.updateMany(
        { _id: { $in: removedTasks } },
        { $set: { assignedUser: "", assignedUserName: "unassigned" } },
      );

      const addedTasks = newPendingTasks.filter(
        (taskId) => !oldPendingTasks.includes(taskId),
      );
      await Task.updateMany(
        { _id: { $in: addedTasks } },
        { $set: { assignedUser: userId, assignedUserName: name } },
      );

      if (user.name !== name) {
        await Task.updateMany(
          { assignedUser: userId },
          { $set: { assignedUserName: name } },
        );
      }

      user.name = name;
      user.email = email;
      user.pendingTasks = newPendingTasks;
      await user.save();

      return res.status(200).json({ message: "OK", data: user });
    } catch (e) {
      return res
        .status(500)
        .json({ message: "Internal Server Error", data: {} });
    }
  });
};
