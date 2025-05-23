const { db } = require("../config/db")
const { generateEmployeeId } = require("../utils/idGenerator")

const Employee = {
  /**
   * Find employee by ID
   * @param {string} employeeId - Employee ID
   * @returns {Promise<Object>} - Employee object
   */
  findById: async (employeeId) => {
    return await db("employees as e")
      .leftJoin("departments as d", "e.department_id", "d.id")
      .leftJoin("users as u", "e.user_id", "u.id")
      .select(
        "e.*",
        "d.name as department_name",
        "d.manager_id as department_manager_id",
        "u.email as user_email",
        "u.role as user_role",
        "u.active as user_active"
      )
      .where("e.employee_id", employeeId)
      .first()
  },

  /**
   * Find employee by user ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Employee object
   */
  findByUserId: async (userId) => {
    return await db("employees as e")
      .leftJoin("departments as d", "e.department_id", "d.id")
      .select(
        "e.*",
        "d.name as department_name",
        "d.manager_id as department_manager_id"
      )
      .where("e.user_id", userId)
      .first()
  },

  /**
   * Find employee by email
   * @param {string} email - Employee email
   * @returns {Promise<Object>} - Employee object
   */
  findByEmail: async (email) => {
    return await db("employees").where({ email }).first()
  },

  /**
   * Get all employees
   * @param {Object} filters - Optional filters
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} - Paginated employees
   */
  getAll: async (filters = {}, page = 1, limit = 10) => {
    // First, get the total count with a separate query
    const countQuery = db("employees as e")
      .leftJoin("departments as d", "e.department_id", "d.id")
      .leftJoin("users as u", "e.user_id", "u.id");

    // Apply filters to count query
    if (filters.department_id) {
      countQuery.where("e.department_id", filters.department_id);
    }

    if (filters.employment_status) {
      countQuery.where("e.employment_status", filters.employment_status);
    }

    if (filters.search) {
      countQuery.where((builder) => {
        builder
          .where("e.full_name", "ilike", `%${filters.search}%`)
          .orWhere("e.nik", "ilike", `%${filters.search}%`)
          .orWhere("e.email", "ilike", `%${filters.search}%`)
          .orWhere("e.position", "ilike", `%${filters.search}%`);
      });
    }

    // Get total count
    const { count } = await countQuery.count("e.employee_id as count").first();
    const total = parseInt(count, 10);

    // Main query for fetching employees
    const query = db("employees as e")
      .leftJoin("departments as d", "e.department_id", "d.id")
      .leftJoin("users as u", "e.user_id", "u.id")
      .select(
        "e.*",
        "d.name as department_name",
        "u.email as user_email",
        "u.role as user_role",
        "u.active as user_active"
      );

    // Apply the same filters to main query
    if (filters.department_id) {
      query.where("e.department_id", filters.department_id);
    }

    if (filters.employment_status) {
      query.where("e.employment_status", filters.employment_status);
    }

    if (filters.search) {
      query.where((builder) => {
        builder
          .where("e.full_name", "ilike", `%${filters.search}%`)
          .orWhere("e.nik", "ilike", `%${filters.search}%`)
          .orWhere("e.email", "ilike", `%${filters.search}%`)
          .orWhere("e.position", "ilike", `%${filters.search}%`);
      });
    }

    // Apply pagination
    const offset = (page - 1) * limit;
    query.orderBy("e.full_name", "asc").offset(offset).limit(limit);

    // Execute query
    const employees = await query;

    return {
      data: employees,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Create a new employee
   * @param {Object} employeeData - Employee data
   * @returns {Promise<Object>} - Created employee object
   */
  create: async (employeeData) => {
    // Generate employee ID if not provided
    const employeeId = employeeData.employee_id || await generateEmployeeId()

    // Insert employee
    const [id] = await db("employees")
      .insert({
        employee_id: employeeId,
        full_name: employeeData.full_name,
        gender: employeeData.gender,
        place_of_birth: employeeData.place_of_birth,
        date_of_birth: employeeData.date_of_birth,
        address: employeeData.address,
        phone_number: employeeData.phone_number,
        email: employeeData.email,
        marital_status: employeeData.marital_status,
        number_of_children: employeeData.number_of_children || 0,
        position: employeeData.position,
        department: employeeData.department,
        department_id: employeeData.department_id,
        hire_date: employeeData.hire_date,
        employment_status: employeeData.employment_status || 'permanent',
        basic_salary: employeeData.basic_salary,
        allowance: employeeData.allowance || 0,
        profile_picture: employeeData.profile_picture,
        user_id: employeeData.user_id,
      })
      .returning("employee_id")

    // Return created employee
    return await Employee.findById(id)
  },

  /**
   * Update an employee
   * @param {string} employeeId - Employee ID
   * @param {Object} employeeData - Employee data to update
   * @returns {Promise<Object>} - Updated employee object
   */
  update: async (employeeId, employeeData) => {
    // Update employee
    await db("employees")
      .where({ employee_id: employeeId })
      .update({
        ...employeeData,
        updated_at: db.fn.now(),
      })

    // Return updated employee
    return await Employee.findById(employeeId)
  },

  /**
   * Delete an employee
   * @param {string} employeeId - Employee ID
   * @returns {Promise<boolean>} - Success status
   */
  delete: async (employeeId) => {
    const deleted = await db("employees").where({ employee_id: employeeId }).delete()
    return deleted > 0
  },

  /**
   * Get employees by department
   * @param {string} departmentId - Department ID
   * @returns {Promise<Array>} - Array of employees
   */
  getByDepartment: async (departmentId) => {
    return await db("employees")
      .where({ department_id: departmentId })
      .orderBy("full_name", "asc")
  },

  /**
   * Get employee statistics
   * @returns {Promise<Object>} - Employee statistics
   */
  getStatistics: async () => {
    // Get total employees
    const { total } = await db("employees").count("employee_id as total").first()

    // Get employees by gender
    const genderStats = await db("employees")
      .select("gender")
      .count("employee_id as count")
      .groupBy("gender")

    // Get employees by employment status
    const statusStats = await db("employees")
      .select("employment_status")
      .count("employee_id as count")
      .groupBy("employment_status")

    // Get employees by department
    const departmentStats = await db("employees")
      .select("department")
      .count("employee_id as count")
      .groupBy("department")

    // Get new employees this month
    const currentDate = new Date()
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const { newHires } = await db("employees")
      .where("hire_date", ">=", firstDayOfMonth)
      .count("employee_id as newHires")
      .first()

    return {
      total: parseInt(total, 10),
      genderDistribution: genderStats,
      statusDistribution: statusStats,
      departmentDistribution: departmentStats,
      newHiresThisMonth: parseInt(newHires, 10),
    }
  },
}

module.exports = Employee
