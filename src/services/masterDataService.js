const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")

class MasterDataService {
  // Department operations
  async getDepartments() {
    return await db("departments")
      .select("id", "name", "description", "created_at", "updated_at")
      .orderBy("name", "asc")
  }

  async createDepartment(name, description) {
    // Generate department ID
    const result = await db.raw(`SELECT id FROM departments WHERE id::TEXT LIKE 'dept%' ORDER BY id DESC LIMIT 1`)
    let newId
    if (result.rows.length === 0) {
      newId = 'dept001'
    } else {
      const lastId = result.rows[0].id
      const numericPart = lastId.replace('dept', '')
      const nextNum = (parseInt(numericPart) + 1).toString().padStart(3, '0')
      newId = `dept${nextNum}`
    }

    const [department] = await db("departments")
      .insert({
        id: newId,
        name,
        description: description || "",
      })
      .returning("*")

    return department
  }

  // Job Position operations
  async getJobPositions() {
    try {
      // Try to get from database first
      const positions = await db("job_positions")
        .select("id", "name", "code", "description", "level", "department", "min_salary", "max_salary")
        .where("active", true)
        .orderBy(["level", "name"])
      
      if (positions.length > 0) {
        return positions
      }
    } catch (error) {
      console.warn("Job positions table might not exist, falling back to static data")
    }

    // Fallback to static data if table doesn't exist
    return [
      { id: "pos_001", name: "CEO", code: "CEO", description: "Chief Executive Officer", level: 1 },
      { id: "pos_002", name: "CTO", code: "CTO", description: "Chief Technology Officer", level: 2 },
      { id: "pos_003", name: "CFO", code: "CFO", description: "Chief Financial Officer", level: 2 },
      { id: "pos_004", name: "HR Director", code: "HRD", description: "Human Resources Director", level: 2 },
      { id: "pos_005", name: "Senior Developer", code: "SDEV", description: "Senior Software Developer", level: 3 },
      { id: "pos_006", name: "Junior Developer", code: "JDEV", description: "Junior Software Developer", level: 4 },
      { id: "pos_007", name: "HR Specialist", code: "HRSP", description: "Human Resources Specialist", level: 4 },
    ]
  }

  // Leave Type operations
  async getLeaveTypes() {
    try {
      // Try to get from database first
      const types = await db("leave_types")
        .select("id", "name", "code", "description", "max_days", "is_paid")
        .where("active", true)
        .orderBy("name")
      
      if (types.length > 0) {
        return types
      }
    } catch (error) {
      console.warn("Leave types table might not exist, falling back to static data")
    }

    // Fallback to static data
    return [
      { id: "lt_001", name: "Annual Leave", code: "annual", description: "Regular vacation leave", max_days: 20, is_paid: true },
      { id: "lt_002", name: "Sick Leave", code: "sick", description: "Leave due to illness", max_days: 10, is_paid: true },
      { id: "lt_003", name: "Long Leave", code: "long", description: "Extended leave", max_days: 90, is_paid: false },
      { id: "lt_004", name: "Maternity Leave", code: "maternity", description: "Leave for childbirth", max_days: 90, is_paid: true },
      { id: "lt_005", name: "Paternity Leave", code: "paternity", description: "Leave for fathers", max_days: 14, is_paid: true },
      { id: "lt_006", name: "Marriage Leave", code: "marriage", description: "Leave for marriage", max_days: 3, is_paid: true },
      { id: "lt_007", name: "Death Leave", code: "death", description: "Bereavement leave", max_days: 2, is_paid: true },
      { id: "lt_008", name: "Hajj/Umrah Leave", code: "hajj_umrah", description: "Religious pilgrimage", max_days: 30, is_paid: true },
    ]
  }

  // Employment Type operations
  async getEmploymentTypes() {
    try {
      // Try to get from database first
      const types = await db("employment_types")
        .select("id", "name", "code", "description")
        .where("active", true)
        .orderBy("name")
      
      if (types.length > 0) {
        return types
      }
    } catch (error) {
      console.warn("Employment types table might not exist, falling back to static data")
    }

    // Fallback to static data
    return [
      { id: "et_001", name: "Permanent", code: "permanent", description: "Regular full-time permanent employment" },
      { id: "et_002", name: "Contract", code: "contract", description: "Fixed-term contract employment" },
      { id: "et_003", name: "Probation", code: "probation", description: "Probationary employment period" },
      { id: "et_004", name: "Intern", code: "intern", description: "Internship position" },
      { id: "et_005", name: "Part-time", code: "part_time", description: "Part-time employment" },
    ]
  }

  // Get all master data at once
  async getAllMasterData() {
    const [departments, jobPositions, leaveTypes, employmentTypes] = await Promise.all([
      this.getDepartments(),
      this.getJobPositions(),
      this.getLeaveTypes(),
      this.getEmploymentTypes()
    ])

    return {
      departments,
      jobPositions,
      leaveTypes,
      employmentTypes,
    }
  }

  // Cache management
  clearCache() {
    // Implement caching later if needed
  }
}

module.exports = new MasterDataService() 