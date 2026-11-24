
import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { getDatabase } from "./config/database";

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  try {
    // Confirm SQL Server connection before starting API
    await getDatabase();

    app.listen(PORT, () => {
      console.log(`PropertyIQ API running on port ${PORT}`);
      console.log(`Health: http://localhost:${PORT}/api/v1/health`);
    });
  } catch (error) {
    console.error("Failed to start PropertyIQ:", error);
    process.exit(1);
  }
}

startServer();
