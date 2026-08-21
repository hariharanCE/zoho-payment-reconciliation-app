require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const reportRoutes = require("./routes/report");
const collectionsRoutes = require("./routes/collections");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/api", reportRoutes);
app.use("/api", collectionsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Payment reconciliation app running at http://localhost:${PORT}`);
});
