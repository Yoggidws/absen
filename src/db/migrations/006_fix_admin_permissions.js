const PERMISSION_NAME = "manage:attendance";
const ROLE_NAME = "admin";

exports.up = async function (knex) {
  // 1. Ensure the permission exists
  const permission = await knex("permissions").where({ name: PERMISSION_NAME }).first();
  if (!permission) {
    console.log(`Permission '${PERMISSION_NAME}' not found. Inserting it.`);
    await knex("permissions").insert({
      id: `perm_${PERMISSION_NAME.replace(/:/g, "_")}`,
      name: PERMISSION_NAME,
      description: "Can manage attendance (e.g., generate QR)",
    });
    console.log(`✅ Inserted permission: ${PERMISSION_NAME}`);
  }

  // 2. Ensure the role exists
  const role = await knex("roles").where({ name: ROLE_NAME }).first();
  if (!role) {
    console.error(`Role '${ROLE_NAME}' not found. Skipping permission assignment.`);
    return;
  }

  // 3. Get the IDs for the role and permission
  const permissionId = (await knex("permissions").where({ name: PERMISSION_NAME }).first()).id;
  const roleId = role.id;

  // 4. Check if the role already has the permission
  const existingMapping = await knex("role_permissions")
    .where({
      role_id: roleId,
      permission_id: permissionId,
    })
    .first();

  // 5. If the mapping doesn't exist, insert it
  if (!existingMapping) {
    await knex("role_permissions").insert({
      role_id: roleId,
      permission_id: permissionId,
    });
    console.log(`✅ Assigned permission '${PERMISSION_NAME}' to role '${ROLE_NAME}'`);
  } else {
    console.log(`Permission '${PERMISSION_NAME}' already assigned to role '${ROLE_NAME}'. Skipping.`);
  }
};

exports.down = async function (knex) {
  // Find the permission and role IDs
  const permission = await knex("permissions").where({ name: PERMISSION_NAME }).first();
  const role = await knex("roles").where({ name: ROLE_NAME }).first();

  if (permission && role) {
    // Remove the role-permission mapping
    await knex("role_permissions")
      .where({
        role_id: role.id,
        permission_id: permission.id,
      })
      .del();
    console.log(`Removed permission '${PERMISSION_NAME}' from role '${ROLE_NAME}'`);
  }
}; 