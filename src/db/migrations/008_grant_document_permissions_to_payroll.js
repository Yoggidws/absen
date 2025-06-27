const DOCUMENT_PERMISSIONS = [
  "read:document:all",
  "upload:document:all",
  "update:document:all",
  "delete:document:all",
]

const PAYROLL_ROLE_ID = "role_payroll"

exports.up = async function (knex) {
  const permissions = await knex("permissions")
    .whereIn("name", DOCUMENT_PERMISSIONS)
    .select("id")

  if (permissions.length !== DOCUMENT_PERMISSIONS.length) {
    console.warn(
      "Warning: Not all document permissions were found. The payroll role might not get full access."
    )
  }

  const existingMappings = await knex("role_permissions")
    .where({ role_id: PAYROLL_ROLE_ID })
    .whereIn(
      "permission_id",
      permissions.map((p) => p.id)
    )

  const existingPermissionIds = existingMappings.map((m) => m.permission_id)

  const mappingsToInsert = permissions
    .filter((p) => !existingPermissionIds.includes(p.id))
    .map((p) => ({
      role_id: PAYROLL_ROLE_ID,
      permission_id: p.id,
    }))

  if (mappingsToInsert.length > 0) {
    await knex("role_permissions").insert(mappingsToInsert)
    console.log(
      `✅ Granted ${mappingsToInsert.length} document permissions to the Payroll role.`
    )
  } else {
    console.log("Payroll role already has all specified document permissions. No changes made.")
  }
}

exports.down = async function (knex) {
  const permissionIds = await knex("permissions")
    .whereIn("name", DOCUMENT_PERMISSIONS)
    .select("id")

  await knex("role_permissions")
    .where({ role_id: PAYROLL_ROLE_ID })
    .whereIn(
      "permission_id",
      permissionIds.map((p) => p.id)
    )
    .del()

  console.log(`Reverted document permissions from the Payroll role.`)
} 