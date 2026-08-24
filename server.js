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
const server = app.listen(PORT, () => {
  console.log(`Payment reconciliation app running at http://localhost:${PORT}`);
});

// A reconciliation over a wide date range legitimately runs for minutes.
// Node has capped a single request at 300s since v18, which would sever the
// socket mid-report and hand the browser an empty body; the routes police
// their own duration instead. headersTimeout must stay above the platform's
// keep-alive so an idle pooled connection is closed by us, not mid-request.
server.requestTimeout = 0;
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;