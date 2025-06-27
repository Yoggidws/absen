require("dotenv").config();
const path = require("path");

module.exports = {
  development: {
    client: "pg",
    connection: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
      timezone: "UTC",
      application_name: "attendance_system",
      query_timeout: 30000,
      connectionTimeoutMillis: 10000,
    },
    pool: {
      min: 2,
      max: 20,
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 10000,
      reapIntervalMillis: 30000,
      createTimeoutMillis: 10000,
      createRetryIntervalMillis: 1000,
      propagateCreateError: false,
      destroyTimeoutMillis: 5000,
    },
    migrations: {
      tableName: "knex_migrations",
      directory: path.join(__dirname, "src/db/migrations"),
    },
    seeds: {
      directory: path.join(__dirname, "src/db/seeds"),
    },
  },
  production: {
    client: "pg",
    connection: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
      timezone: "UTC",
      application_name: "attendance_system",
      query_timeout: 30000,
      connectionTimeoutMillis: 10000,
    },
    pool: {
      min: 2,
      max: 20,
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 10000,
      reapIntervalMillis: 30000,
      createTimeoutMillis: 10000,
      createRetryIntervalMillis: 1000,
      propagateCreateError: false,
      destroyTimeoutMillis: 5000,
    },
    migrations: {
      tableName: "knex_migrations",
      directory: path.join(__dirname, "src/db/migrations"),
    },
    seeds: {
      directory: path.join(__dirname, "src/db/seeds"),
    },
  },
}; 