const { db } = require('./src/config/db');
const LeaveApprovalService = require('./src/services/leaveApprovalService');

async function testLeaveAPI() {
  console.log('=== Testing Leave API ===\n');

  try {
    // Test 1: Check if LeaveApprovalService can be instantiated
    console.log('1. Testing LeaveApprovalService instantiation...');
    const leaveApprovalService = new LeaveApprovalService();
    console.log('✓ LeaveApprovalService instantiated successfully\n');

    // Test 2: Check if admin user exists
    console.log('2. Checking for admin user...');
    const adminUser = await db('users')
      .where('email', 'admin@example.com')
      .select('id', 'name', 'email', 'role')
      .first();
    
    if (adminUser) {
      console.log('✓ Admin user found:', adminUser);
    } else {
      console.log('✗ No admin user found');
      return;
    }

    // Test 3: Check leave_requests table structure
    console.log('\n3. Checking leave_requests table...');
    const tableExists = await db.schema.hasTable('leave_requests');
    if (tableExists) {
      console.log('✓ leave_requests table exists');
      
      // Check recent leave requests
      const recentRequests = await db('leave_requests')
        .orderBy('created_at', 'desc')
        .limit(3)
        .select('id', 'type', 'status', 'created_at');
      
      console.log('Recent leave requests:', recentRequests.length);
      recentRequests.forEach(req => {
        console.log(`  - ${req.id}: ${req.type} (${req.status})`);
      });
    } else {
      console.log('✗ leave_requests table does not exist');
    }

    // Test 4: Check leave_approval_workflow table
    console.log('\n4. Checking leave_approval_workflow table...');
    const workflowTableExists = await db.schema.hasTable('leave_approval_workflow');
    if (workflowTableExists) {
      console.log('✓ leave_approval_workflow table exists');
    } else {
      console.log('✗ leave_approval_workflow table does not exist');
    }

    // Test 5: Test creating a simple leave request
    console.log('\n5. Testing leave request creation...');
    const testLeaveData = {
      user_id: adminUser.id,
      type: 'annual',
      start_date: new Date('2024-01-15'),
      end_date: new Date('2024-01-17'),
      reason: 'API Test Leave Request'
    };

    try {
      const result = await leaveApprovalService.createLeaveRequestAndInitializeWorkflow(testLeaveData);
      console.log('✓ Leave request created successfully');
      console.log('  Leave Request ID:', result.leaveRequest.id);
      console.log('  Initial Status:', result.leaveRequest.status);
      
      // Clean up - delete the test request
      await db('leave_requests').where('id', result.leaveRequest.id).del();
      await db('leave_approval_workflow').where('leave_request_id', result.leaveRequest.id).del();
      console.log('✓ Test request cleaned up');
    } catch (error) {
      console.log('✗ Failed to create leave request:', error.message);
    }

    console.log('\n=== Test Complete ===');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await db.destroy();
    process.exit(0);
  }
}

testLeaveAPI(); 