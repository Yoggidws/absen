/**
 * @deprecated This file is deprecated and will be removed.
 * The functionality has been consolidated into rbacMiddleware.js and enhancedAuthMiddleware.js.
 */
// const { db } = require("../config/db")
// const { asyncHandler } = require("./errorMiddleware")
// const NodeCache = require("node-cache")

// // Cache permissions for 5 minutes
// const permissionCache = new NodeCache({ stdTTL: 300 })

// const clearCache = (userId = null) => {
//   if (userId) {
//     const cacheKey = `permissions_${userId}`
//     if (permissionCache.has(cacheKey)) {
//       permissionCache.del(cacheKey)
//       console.log(`Cleared permission cache for user ${userId}`)
//     }
//   } else {
//     permissionCache.flushAll()
//     console.log("Cleared all permission cache")
//   }
// }

// const fetchUserRolesAndPermissions = async (userId) => {
//   const cacheKey = `permissions_${userId}`
//   const cachedData = permissionCache.get(cacheKey)
//   if (cachedData) {
//     return cachedData
//   }

//   const userWithRoles = await db("users")
//     .leftJoin("user_roles", "users.id", "user_roles.user_id")
//     .leftJoin("roles", "user_roles.role_id", "roles.id")
//     .where("users.id", userId)
//     .select("users.*", "roles.name as role_name")

//   if (!userWithRoles || userWithRoles.length === 0) {
//     return { user: null, roles: [], permissions: [] }
//   }

//   const user = { ...userWithRoles[0] }
//   delete user.role_name
//   const roles = [...new Set(userWithRoles.map((r) => r.role_name).filter(Boolean))]

//   // Get permissions for roles
//   const rolePermissions = await db("roles")
//     .join("role_permissions", "roles.id", "role_permissions.role_id")
//     .join("permissions", "role_permissions.permission_id", "permissions.id")
//     .whereIn(
//       "roles.name",
//       roles.map((r) => r.toLowerCase()),
//     )
//     .select("permissions.name as permission_name")

//   const permissions = [...new Set(rolePermissions.map((p) => p.permission_name))]

//   const authData = { user, roles, permissions }
//   permissionCache.set(cacheKey, authData)

//   return authData
// }

// const hasPermission = (permissionName) => {
//   return asyncHandler(async (req, res, next) => {
//     if (!req.user) {
//       res.status(401)
//       throw new Error("Not authenticated")
//     }

//     // Admins have all permissions
//     if (req.user.role === "admin") {
//       return next()
//     }

//     // Check if permission exists in user's permissions array
//     if (req.user.permissions && req.user.permissions.includes(permissionName)) {
//       return next()
//     }

//     // Dynamic permission check based on ownership (e.g., "read:profile:own")
//     if (permissionName.endsWith(":own")) {
//       const resourceId = req.params.id
//       const userId = req.user.id

//       if (resourceId === userId) {
//         const basePermission = permissionName.replace(":own", ":all")
//         if (req.user.permissions && req.user.permissions.includes(basePermission)) {
//           return next()
//         }
//       }
//     }

//     // Fallback to fetching permissions if not on user object
//     try {
//       const { permissions } = await fetchUserRolesAndPermissions(req.user.id)
//       if (permissions.includes(permissionName)) {
//         // Optionally attach permissions to req.user for subsequent checks
//         req.user.permissions = permissions
//         return next()
//       }

//       res.status(403)
//       throw new Error(`Forbidden: You lack the '${permissionName}' permission.`)
//     } catch (error) {
//       next(error)
//     }
//   })
// }

// const hasAnyPermission = (permissionNames) => {
//   return asyncHandler(async (req, res, next) => {
//     if (!req.user) {
//       res.status(401)
//       throw new Error("Not authenticated")
//     }

//     // Admins have all permissions
//     if (req.user.role === "admin") {
//       return next()
//     }

//     // Check for any matching permission
//     if (req.user.permissions && permissionNames.some((p) => req.user.permissions.includes(p))) {
//       return next()
//     }

//     // Dynamic ownership check
//     const hasOwnershipPermission = permissionNames.some((p) => {
//       if (p.endsWith(":own")) {
//         const resourceId = req.params.id
//         const userId = req.user.id
//         return resourceId === userId
//       }
//       return false
//     })

//     if (hasOwnershipPermission) {
//       return next()
//     }

//     // Fallback to fetching permissions
//     try {
//       const { permissions } = await fetchUserRolesAndPermissions(req.user.id)
//       if (permissionNames.some((p) => permissions.includes(p))) {
//         req.user.permissions = permissions
//         return next()
//       }
//       res.status(403)
//       throw new Error(`Forbidden: You need one of the following permissions: ${permissionNames.join(", ")}.`)
//     } catch (error) {
//       next(error)
//     }
//   })
// }

// const hasAllPermissions = (permissionNames) => {
//   return asyncHandler(async (req, res, next) => {
//     if (!req.user) {
//       res.status(401)
//       throw new Error("Not authenticated")
//     }

//     // Admins have all permissions
//     if (req.user.role === "admin") {
//       return next()
//     }

//     // Check for all required permissions
//     if (req.user.permissions && permissionNames.every((p) => req.user.permissions.includes(p))) {
//       return next()
//     }

//     // Fallback to fetching permissions
//     try {
//       const { permissions } = await fetchUserRolesAndPermissions(req.user.id)
//       if (permissionNames.every((p) => permissions.includes(p))) {
//         req.user.permissions = permissions
//         return next()
//       }
//       res.status(403)
//       throw new Error(`Forbidden: You need all of the following permissions: ${permissionNames.join(", ")}.`)
//     } catch (error) {
//       next(error)
//     }
//   })
// }

// const hasRole = (roleName) => {
//   return asyncHandler(async (req, res, next) => {
//     if (!req.user) {
//       res.status(401)
//       throw new Error("Not authenticated")
//     }

//     // Check single role
//     if (req.user.role === roleName) {
//       return next()
//     }

//     // Check roles array
//     if (req.user.roles && req.user.roles.includes(roleName)) {
//       return next()
//     }

//     // Fallback to fetching roles
//     try {
//       const { roles } = await fetchUserRolesAndPermissions(req.user.id)
//       if (roles.includes(roleName)) {
//         req.user.roles = roles
//         return next()
//       }

//       res.status(403)
//       throw new Error(`Forbidden: You must have the '${roleName}' role.`)
//     } catch (error) {
//       next(error)
//     }
//   })
// }

// const hasAnyRole = (roleNames) => {
//   return asyncHandler(async (req, res, next) => {
//     if (!req.user) {
//       res.status(401)
//       throw new Error("Not authenticated")
//     }

//     // Check single role
//     if (roleNames.includes(req.user.role)) {
//       return next()
//     }

//     // Check roles array
//     if (req.user.roles && roleNames.some((r) => req.user.roles.includes(r))) {
//       return next()
//     }

//     // Fallback to fetching roles
//     try {
//       const { roles } = await fetchUserRolesAndPermissions(req.user.id)
//       if (roleNames.some((r) => roles.includes(r))) {
//         req.user.roles = roles
//         return next()
//       }

//       res.status(403)
//       throw new Error(`Forbidden: You must have one of the following roles: ${roleNames.join(", ")}.`)
//     } catch (error) {
//       next(error)
//     }
//   })
// }

// module.exports = {
//   clearCache,
//   fetchUserRolesAndPermissions,
//   hasPermission,
//   hasAnyPermission,
//   hasAllPermissions,
//   hasRole,
//   hasAnyRole,
// }
