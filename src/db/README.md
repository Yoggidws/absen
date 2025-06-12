# Database Migrations and Seeds - Consolidated Structure

This directory contains a streamlined version of the database migrations and seeds, consolidating multiple related files into logical groups.

## Migration Structure

The migrations have been consolidated from 20+ files into 5 focused migrations:

### 001_core_schema.js
- **Purpose**: Core database schema with essential tables
- **Tables Created**:
  - `users` - User accounts with roles, contact info, and owner flag
  - `departments` - Department structure
  - `attendance` - Attendance tracking with QR codes
  - `documents` - Document management
  - `announcements` - System announcements
  - `reports` - Report generation and scheduling

### 002_hr_system.js
- **Purpose**: Human Resources management system
- **Tables Created**:
  - `employees` - Employee profiles with detailed information
  - `compensation` - Salary and allowance management
  - `onboarding_tasks` - New employee onboarding workflow
  - `offboarding_tasks` - Employee departure workflow

### 003_leave_system.js
- **Purpose**: Complete leave management system
- **Tables Created**:
  - `leave_requests` - Leave applications and approvals
  - `leave_approval_workflow` - Multi-level approval process
  - `leave_balance` - Annual leave balances by type
  - `leave_balance_audit` - Audit trail for balance adjustments

### 004_role_permission_system.js
- **Purpose**: Role-based access control system
- **Tables Created**:
  - `permissions` - System permissions
  - `roles` - User roles
  - `role_permissions` - Role-permission mappings
  - `user_roles` - User-role assignments

### 005_payroll_system.js
- **Purpose**: Payroll processing system
- **Tables Created**:
  - `payroll_periods` - Monthly payroll periods
  - `payroll_items` - Individual employee payroll records

## Seed Structure

The seeds have been consolidated from 7+ files into 2 focused seed files:

### 01_initial_data.js
- **Purpose**: Essential system setup data
- **Creates**:
  - System administrator account
  - Default departments
  - System roles (admin, manager, hr, payroll, employee, hr_manager)
  - Comprehensive permissions system
  - Role-permission mappings

### 02_sample_data.js
- **Purpose**: Sample data for development and testing
- **Creates**:
  - Sample employees with different roles
  - User-role assignments
  - Leave balance records for all users
  - Sample attendance records (past 7 days)
  - Sample leave requests with various statuses

## Key Improvements

1. **Reduced Complexity**: From 20+ migration files to 5 logical groups
2. **Better Organization**: Related tables grouped together
3. **Comprehensive Setup**: Single command creates complete system
4. **Sample Data**: Realistic test data for development
5. **Role-Based Security**: Complete RBAC system from start
6. **Leave Types**: Support for 8 different leave types including cultural/religious leaves

## Usage

### Run All Migrations
```bash
node backend/src/db/migrate.js latest
```

### Run All Seeds
```bash
node backend/src/db/seed.js
```

### Check Migration Status
```bash
node backend/src/db/migrate.js status
```

## Default Accounts

After seeding, the following accounts are available:

- **Admin**: admin@example.com / Admin@123!Secure
- **Manager**: manager@example.com / Employee@123
- **HR**: carol@example.com / Employee@123
- **Payroll**: eve@example.com / Employee@123
- **Employees**: alice@example.com, bob@example.com, dave@example.com / Employee@123

## Leave Types Supported

- **annual** - Annual vacation leave (20 days)
- **sick** - Sick leave (10 days)
- **long** - Long-term leave (90 days)
- **maternity** - Maternity leave (90 days)
- **paternity** - Paternity leave (14 days)
- **marriage** - Marriage leave (3 days)
- **death** - Bereavement leave (2 days)
- **hajj_umrah** - Religious pilgrimage leave (30 days)

## Migration History

The original migrations have been preserved and can be found in the backup directory if needed. This consolidation maintains all functionality while significantly improving maintainability and setup speed. 