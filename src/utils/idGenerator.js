/**
 * Utility functions for generating IDs
 */

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

module.exports = {
  generateId
};
