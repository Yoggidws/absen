// import { api } from "./api"

// // Leave API
// export const leaveApi = {
//   // Get all leave requests for the current user or all users (admin)
//   getAll: async (params) => {
//     try {
//       return await api.get("/leave", { params })
//     } catch (error) {
//       throw error
//     }
//   },

//   // Get leave request by ID
//   getById: async (id) => {
//     try {
//       return await api.get(`/leave/${id}`)
//     } catch (error) {
//       throw error
//     }
//   },

//   // Get leave balance for the current user
//   getBalance: async () => {
//     try {
//       return await api.get("/leave/balance")
//     } catch (error) {
//       throw error
//     }
//   },

//   // Get department overview (for managers and admins)
//   getDepartmentOverview: async (params) => {
//     try {
//       return await api.get("/leave/department-overview", { params })
//     } catch (error) {
//       throw error
//     }
//   },

//   // Create a new leave request
//   createLeaveRequest: async (leaveData) => {
//     try {
//       return await api.post("/leave", leaveData)
//     } catch (error) {
//       throw error
//     }
//   },

//   // Update leave request status (approve/reject) - for managers and admins
//   updateLeaveRequestStatus: async (id, statusData) => {
//     try {
//       return await api.put(`/leave/${id}`, statusData)
//     } catch (error) {
//       throw error
//     }
//   },

//   // Cancel a leave request
//   cancelLeaveRequest: async (id) => {
//     try {
//       return await api.put(`/leave/${id}/cancel`)
//     } catch (error) {
//       throw error
//     }
//   },

//   // Get pending approvals (for managers and admins)
//   getPendingApprovals: async () => {
//     try {
//       return await api.get("/leave/pending-approval")
//     } catch (error) {
//       throw error
//     }
//   },

//   // Get approval workflow for a leave request
//   getApprovalWorkflow: async (id) => {
//     try {
//       return await api.get(`/leave/${id}/workflow`)
//     } catch (error) {
//       throw error
//     }
//   },

//   // Get leave statistics (for admins)
//   getLeaveStatistics: async (params) => {
//     try {
//       return await api.get("/leave/stats", { params })
//     } catch (error) {
//       throw error
//     }
//   },

//   // Bulk approve/reject multiple leave requests
//   bulkUpdateStatus: async (requestIds, status, comments) => {
//     try {
//       return await api.post("/leave/bulk-update", {
//         requestIds,
//         status,
//         comments
//       })
//     } catch (error) {
//       throw error
//     }
//   },

//   // Get leave requests by status for workflow management
//   getByStatus: async (status, params) => {
//     try {
//       return await api.get("/leave", { 
//         params: { 
//           status, 
//           ...params 
//         } 
//       })
//     } catch (error) {
//       throw error
//     }
//   },

//   // Get leave requests requiring user's approval
//   getMyApprovals: async (params) => {
//     try {
//       return await api.get("/leave/my-approvals", { params })
//     } catch (error) {
//       throw error
//     }
//   }
// }
