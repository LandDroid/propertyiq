
import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

const config: sql.config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || "localhost",
  database: process.env.DB_NAME || "PropertyIQ",

  ...(process.env.DB_INSTANCE
    ? {}
    : { port: Number(process.env.DB_PORT || 1433) }),

  options: {
    ...(process.env.DB_INSTANCE
      ? { instanceName: process.env.DB_INSTANCE }
      : {}),
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_CERT === "true",
    enableArithAbort: true
  },

  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },

  connectionTimeout: 15000,
  requestTimeout: 30000
};

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export async function getDatabase(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .then((pool: sql.ConnectionPool) => {
        console.log("Connected to PropertyIQ SQL Server");
        return pool;
      })
      .catch((error: unknown) => {
        poolPromise = null;
        throw error;
      });
  }

  return poolPromise;
}

export async function closeDatabase(): Promise<void> {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.close();
    poolPromise = null;
  }
}

export { sql };
