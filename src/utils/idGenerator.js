/**
 * Utility functions for generating IDs
 */
const { db } = require("../config/db");

/**
 * Generate a user ID based on the current year and a sequential number
 * @param {string} prefix - Prefix for the ID (e.g., "ADMIN", "EMP", "MGR")
 * @param {number} index - Sequential number to use
 * @returns {string} - Generated ID in the format "YY0000001" or "ADMIN-YY0000001"
 */
const generateId = (prefix = "", index = 1) => {
  // Get the last 2 digits of the current year
  const yearPart = new Date().getFullYear().toString().slice(-2);

  // Create a sequential number padded to 7 digits
  const sequentialPart = index.toString().padStart(7, "0");

  // Combine year and sequential number
  const numericId = `${yearPart}${sequentialPart}`;

  // Return with prefix if provided
  return prefix ? `${prefix}-${numericId}` : numericId;
};

/**
 * Generate a user ID based on the current year and month
 * Format: YYMMxxx (where YY=year, MM=month, xxx=sequential number)
 * @returns {Promise<string>} - Generated user ID
 */
const generateUserId = async () => {
  // Get current date
  const now = new Date();

  // Get the last 2 digits of the current year
  const year = now.getFullYear().toString().slice(-2);

  // Get the month (1-12) and pad to 2 digits
  const month = (now.getMonth() + 1).toString().padStart(2, "0");

  // Base prefix for the ID (year + month + 3 zeros)
  const prefix = `${year}${month}000`;

  // Find the highest existing ID with this prefix
  const result = await db("users")
    .where("id", "like", `${prefix}%`)
    .orderBy("id", "desc")
    .first();

  if (!result) {
    // No existing IDs with this prefix, start with 1
    return `${prefix}01`;
  }

  // Extract the sequential part and increment
  const currentId = result.id;
  const sequentialPart = parseInt(currentId.slice(-2), 10);
  const nextSequential = (sequentialPart + 1).toString().padStart(2, "0");

  return `${prefix}${nextSequential}`;
};

/**
 * Generate an employee ID based on the current year and month
 * Format: YYMM000xx (where YY=year, MM=month, xx=sequential number)
 * @returns {Promise<string>} - Generated employee ID
 */
const generateEmployeeId = async () => {
  // Get current date
  const now = new Date();

  // Get the last 2 digits of the current year
  const year = now.getFullYear().toString().slice(-2);

  // Get the month (1-12) and pad to 2 digits
  const month = (now.getMonth() + 1).toString().padStart(2, "0");

  // Base prefix for the ID (year + month + 3 zeros)
  const prefix = `${year}${month}000`;

  // Find the highest existing ID with this prefix
  const result = await db("employees")
    .where("employee_id", "like", `${prefix}%`)
    .orderBy("employee_id", "desc")
    .first();

  if (!result) {
    // No existing IDs with this prefix, start with 1
    return `${prefix}01`;
  }

  // Extract the sequential part and increment
  const currentId = result.employee_id;
  const sequentialPart = parseInt(currentId.slice(-2), 10);
  const nextSequential = (sequentialPart + 1).toString().padStart(2, "0");

  return `${prefix}${nextSequential}`;
};

/**
 * Generate a department ID
 * Format: deptxxx (where xxx is a sequential number)
 * @returns {Promise<string>} - Generated department ID
 */
const generateDepartmentId = async () => {
  // Find the highest existing department ID
  const result = await db("departments")
    .where("id", "like", "dept%")
    .orderBy("id", "desc")
    .first();

  if (!result) {
    // No existing IDs, start with 1
    return "dept001";
  }

  // Extract the sequential part and increment
  const currentId = result.id;
  const sequentialPart = parseInt(currentId.replace("dept", ""), 10);
  const nextSequential = (sequentialPart + 1).toString().padStart(3, "0");

  return `dept${nextSequential}`;
};

module.exports = {
  generateId,
  generateUserId,
  generateEmployeeId,
  generateDepartmentId
};
