const { db, getPoolStatus, testConnection } = require('./src/config/db');

async function diagnosePerformance() {
  console.log('=== Database Performance Diagnosis ===\n');

  try {
    // 1. Check current pool status
    console.log('1. Pool Status Check:');
    const poolStatus = getPoolStatus();
    console.log('Current pool status:', poolStatus);
    
    if (poolStatus.used >= poolStatus.max * 0.8) {
      console.warn('⚠️  Pool usage is high! This may cause timeouts.');
    }

    // 2. Test basic connection speed
    console.log('\n2. Connection Speed Test:');
    const start = Date.now();
    const connected = await testConnection();
    const duration = Date.now() - start;
    console.log(`Connection test completed in ${duration}ms`);
    
    if (duration > 3000) {
      console.warn('⚠️  Slow connection detected! This may cause timeouts.');
    }

    // 3. Test simple query performance
    console.log('\n3. Query Performance Test:');
    const queryStart = Date.now();
    try {
      await db.raw('SELECT COUNT(*) FROM users WHERE active = true');
      const queryDuration = Date.now() - queryStart;
      console.log(`Simple query completed in ${queryDuration}ms`);
      
      if (queryDuration > 2000) {
        console.warn('⚠️  Slow query detected! Database may be overloaded.');
      }
    } catch (error) {
      console.error('Query test failed:', error.message);
    }

    // 4. Test complex query (auth data loading simulation)
    console.log('\n4. Complex Query Test (Auth Data):');
    try {
      const complexStart = Date.now();
      const result = await db('users')
        .where('active', true)
        .select('id', 'name', 'email', 'role', 'department')
        .limit(1)
        .first();
      
      if (result) {
        const userId = result.id;
        
        // Simulate auth data loading
        const [userRoles, userPermissions] = await Promise.all([
          db('user_roles as ur')
            .join('roles as r', 'ur.role_id', 'r.id')
            .where('ur.user_id', userId)
            .select('r.id', 'r.name', 'r.display_name'),
          db('role_permissions as rp')
            .join('permissions as p', 'rp.permission_id', 'p.id')
            .join('user_roles as ur', 'rp.role_id', 'ur.role_id')
            .where('ur.user_id', userId)
            .select('p.id', 'p.name', 'p.category')
        ]);
        
        const complexDuration = Date.now() - complexStart;
        console.log(`Complex auth query completed in ${complexDuration}ms`);
        console.log(`Found ${userRoles.length} roles and ${userPermissions.length} permissions`);
        
        if (complexDuration > 5000) {
          console.warn('⚠️  Complex auth query is very slow! This is likely causing timeouts.');
        }
      }
    } catch (error) {
      console.error('Complex query test failed:', error.message);
    }

    // 5. Check for connection leaks
    console.log('\n5. Connection Leak Check:');
    const statusBefore = getPoolStatus();
    
    // Perform multiple rapid queries to test pool behavior
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(db.raw('SELECT 1 as test'));
    }
    
    await Promise.all(promises);
    
    // Wait a moment and check pool status
    await new Promise(resolve => setTimeout(resolve, 1000));
    const statusAfter = getPoolStatus();
    
    console.log('Pool status before rapid queries:', statusBefore);
    console.log('Pool status after rapid queries:', statusAfter);
    
    if (statusAfter.used > statusBefore.used) {
      console.warn('⚠️  Potential connection leak detected!');
    } else {
      console.log('✅ No obvious connection leaks detected');
    }

    // 6. Recommendations
    console.log('\n6. Performance Recommendations:');
    
    if (poolStatus.used >= poolStatus.max * 0.8) {
      console.log('- Consider increasing max pool size or investigating query optimization');
    }
    
    if (duration > 3000) {
      console.log('- Check database server performance and network latency');
    }
    
    console.log('- Ensure proper connection cleanup in all database operations');
    console.log('- Consider implementing query result caching for frequently accessed data');
    console.log('- Monitor slow query logs on the database server');

    console.log('\n=== Diagnosis Complete ===');

  } catch (error) {
    console.error('Diagnosis failed:', error);
  } finally {
    console.log('\nClosing database connections...');
    await db.destroy();
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  diagnosePerformance();
}

module.exports = { diagnosePerformance }; 