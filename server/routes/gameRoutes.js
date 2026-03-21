const express = require("express");
const router = express.Router();
const gameController = require("../controllers/gameController");

router.post("/new-game", gameController.newGame);
router.post("/move", gameController.makeMove);

module.exports = router;
