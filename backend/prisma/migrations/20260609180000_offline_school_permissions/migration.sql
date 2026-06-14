INSERT INTO permissions (id, code, description, created_at)
VALUES
  (gen_random_uuid(), 'offline_school.read', 'View offline school lessons from CRM', NOW()),
  (gen_random_uuid(), 'offline_school.write', 'Manage offline school lessons via CRM proxy', NOW())
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code IN ('offline_school.read', 'offline_school.write')
  AND r.slug IN ('teacher', 'curator', 'branch_manager', 'admin', 'owner', 'super_admin')
ON CONFLICT (role_id, permission_id) DO NOTHING;
