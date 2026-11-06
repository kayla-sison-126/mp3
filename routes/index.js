/*
 * Connect all of your endpoints together here.
 */
const mongoose = require('mongoose');

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

  router.get("/users/:id", async (req, res) => {
    try {
      let dbQuery = User.findById(req.params.id);

      if (req.query.select) {
        try {
          dbQuery = dbQuery.select(JSON.parse(req.query.select));
        } catch (e) {
          return res
            .status(400)
            .json({ message: "Invalid JSON in select parameter", data: {} });
        }
      }

      const user = await dbQuery.exec();
      if (!user) {
        return res.status(404).json({ message: "User not found", data: {} });
      }

      return res.status(200).json({ message: "OK", data: user });
    } catch (e) {
      return res
        .status(404)
        .json({ message: "User not found or invalid ID", data: {} });
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

  router.put("/tasks/:id", async (req, res) => {
    try {
      const taskId = req.params.id;

      if (!mongoose.Types.ObjectId.isValid(taskId)) {
        return res
          .status(404)
          .json({ message: "Task not found or invalid ID", data: {} });
      }

      const task = await Task.findById(taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found", data: {} });
      }

      const {
        name,
        description = "",
        deadline,
        completed = false,
        assignedUser = "",
        assignedUserName = "unassigned",
      } = req.body;

      // check required fields
      if (!name || !deadline) {
        return res
          .status(400)
          .json({ message: "Name and deadline are required", data: {} });
      }

      // check assignedUser if provided
      if (assignedUser && assignedUser !== "") {
        if (!mongoose.Types.ObjectId.isValid(assignedUser)) {
          return res
            .status(400)
            .json({ message: "Invalid assignedUser ID format", data: {} });
        }
        const user = await User.findById(assignedUser);
        if (!user) {
          return res
            .status(404)
            .json({ message: "Assigned user does not exist", data: {} });
        }
        if (assignedUserName !== user.name) {
          return res
            .status(400)
            .json({ message: "assignedUserName mismatch", data: {} });
        }
      }

      const oldAssignedUser = task.assignedUser;
      const wasCompleted = task.completed;

      if (oldAssignedUser && oldAssignedUser !== assignedUser) {
        await User.findByIdAndUpdate(oldAssignedUser, {
          $pull: { pendingTasks: taskId },
        });
      }

      // update task
      task.name = name;
      task.description = description;
      task.deadline = deadline;
      task.completed = completed;
      task.assignedUser = assignedUser;
      task.assignedUserName = assignedUserName;
      await task.save();

      // sync pendingTasks
      if (assignedUser) {
        if (completed) {
          // remove completed tasks from pendingTasks
          await User.findByIdAndUpdate(assignedUser, {
            $pull: { pendingTasks: taskId },
          });
        } else {
          // add unfinished tasks to pendingTasks
          await User.findByIdAndUpdate(assignedUser, {
            $addToSet: { pendingTasks: taskId },
          });
        }
      }

      return res.status(200).json({ message: "OK", data: task });
    } catch (e) {
      if (e.name === "ValidationError") {
        return res.status(400).json({ message: "Validation Error", data: {} });
      }
      return res
        .status(404)
        .json({ message: "Task not found or invalid ID", data: {} });
    }
  });

  router.post("/users", async (req, res) => {
    try {
      const { name, email, pendingTasks = [] } = req.body;

      // check required fields
      if (!name || !email) {
        return res
          .status(400)
          .json({ message: "Name and email are required", data: {} });
      }

      // check if email is already used
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res
          .status(400)
          .json({ message: "Email is already in use.", data: {} });
      }

      // check pendingTasks
      if (!Array.isArray(pendingTasks)) {
        return res.status(400).json({
          message: "pendingTasks must be an array",
          data: {},
        });
      }

      for (const taskId of pendingTasks) {
        if (!mongoose.Types.ObjectId.isValid(taskId)) {
          return res.status(400).json({
            message: "Invalid task ID format in pendingTasks",
            data: {},
          });
        }
        const task = await Task.findById(taskId);
        if (!task) {
          return res.status(404).json({
            message: `Referenced task ${taskId} does not exist`,
            data: {},
          });
        }
        if (task.completed) {
          return res.status(400).json({
            message: "Cannot add a completed task to pendingTasks",
            data: {},
          });
        }
      }

      // create and save new user
      const newUser = new User({ name, email, pendingTasks });
      await newUser.save();

      // update assigned tasks to reference the user
      if (pendingTasks.length > 0) {
        await Task.updateMany(
          { _id: { $in: pendingTasks } },
          {
            $set: {
              assignedUser: newUser._id.toString(),
              assignedUserName: name,
            },
          },
        );
      }

      return res
        .status(201)
        .json({ message: "User created successfully", data: newUser });
    } catch (e) {
      return res
        .status(500)
        .json({ message: "Internal Server Error", data: {} });
    }
  });

  router.post("/tasks", async (req, res) => {
    try {
      const {
        name,
        description = "",
        deadline,
        completed = false,
        assignedUser = "",
        assignedUserName = "unassigned",
      } = req.body;

      // check required fields
      if (!name || !deadline) {
        return res
          .status(400)
          .json({ message: "Name and deadline are required", data: {} });
      }

      // validate assignedUser and assignedUserName if assigned
      if (assignedUser && assignedUser !== "") {
        if (!mongoose.Types.ObjectId.isValid(assignedUser)) {
          return res.status(400).json({
            message: "Invalid assignedUser ID format",
            data: {},
          });
        }
        const user = await User.findById(assignedUser);
        if (!user) {
          return res.status(404).json({
            message: "Assigned user does not exist",
            data: {},
          });
        }

        if (assignedUserName !== user.name) {
          return res.status(400).json({
            message: "assignedUserName does not match the assigned user's name",
            data: {},
          });
        }
      }

      // create and save new task
      const newTask = new Task({
        name,
        description,
        deadline,
        completed,
        assignedUser,
        assignedUserName,
      });
      await newTask.save();

      // if assigned and pending, add to pendingTasks
      if (assignedUser && !completed) {
        await User.findByIdAndUpdate(assignedUser, {
          $addToSet: { pendingTasks: newTask._id.toString() },
        });
      }

      return res
        .status(201)
        .json({ message: "Task created successfully", data: newTask });
    } catch (e) {
      return res
        .status(500)
        .json({ message: "Internal Server Error", data: {} });
    }
  });

  router.delete("/tasks/:id", async (req, res) => {
    try {
      const taskId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(taskId)) {
        return res.status(404).json({ message: "Task not found", data: {} });
      }

      const task = await Task.findById(taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found", data: {} });
      }

      // remove from pendingTasks
      if (task.assignedUser) {
        await User.findByIdAndUpdate(task.assignedUser, {
          $pull: { pendingTasks: taskId },
        });
      }

      await Task.findByIdAndDelete(taskId);
      return res
        .status(200)
        .json({ message: "Task deleted successfully", data: task });
    } catch (e) {
      return res.status(404).json({ message: "Task not found", data: {} });
    }
  });
};
