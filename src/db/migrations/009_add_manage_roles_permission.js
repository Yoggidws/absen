const PERMISSION_NAME = "manage:roles";
const ADMIN_ROLE_ID = "role_admin";

exports.up = async function (knex) {
  // 1. Ensure the permission exists
  const permission = await knex("permissions").where({ name: PERMISSION_NAME }).first();
  if (!permission) {
    await knex("permissions").insert({
      id: `perm_${PERMISSION_NAME.replace(/:/g, "_")}`,
      name: PERMISSION_NAME,
      description: "Can manage roles and permissions, including clearing the cache.",
      category: "System Administration",
    });
    console.log(`✅ Inserted permission: ${PERMISSION_NAME}`);
  }

  // 2. Get the permission ID
  const permissionRecord = await knex("permissions").where({ name: PERMISSION_NAME }).first();
  if (!permissionRecord) {
    throw new Error(`Permission '${PERMISSION_NAME}' not found after attempting to create it.`);
  }

  // 3. Check if the admin role already has the permission
  const existingMapping = await knex("role_permissions")
    .where({
      role_id: ADMIN_ROLE_ID,
      permission_id: permissionRecord.id,
    })
    .first();

  // 4. If the mapping doesn't exist, insert it
  if (!existingMapping) {
    await knex("role_permissions").insert({
      role_id: ADMIN_ROLE_ID,
      permission_id: permissionRecord.id,
    });
    console.log(`✅ Assigned permission '${PERMISSION_NAME}' to the Admin role.`);
  } else {
    console.log(`Admin role already has '${PERMISSION_NAME}' permission. Skipping.`);
  }
};

exports.down = async function (knex) {
  // Find the permission ID
  const permission = await knex("permissions").where({ name: PERMISSION_NAME }).first();
  
  if (permission) {
    // Remove the role-permission mapping
    await knex("role_permissions")
      .where({
        role_id: ADMIN_ROLE_ID,
        permission_id: permission.id,
      })
      .del();
    console.log(`Removed permission '${PERMISSION_NAME}' from the Admin role.`);

    // Optional: remove the permission itself if it's no longer needed by any role
    // For this migration, we'll just remove the assignment.
    // await knex("permissions").where({ id: permission.id }).del();
    // console.log(`Deleted permission '${PERMISSION_NAME}'.`);
  }
}; 