const { db, getPoolStatus, resetPool, destroyConnectionPool } = require('./src/config/db');

async function resetDatabasePool() {
  console.log('=== Database Pool Reset Tool ===\n');

  try {
    // Show current pool status
    console.log('1. Checking current pool status...');
    const currentStatus = getPoolStatus();
    console.log('Current pool status:', currentStatus);

    if (currentStatus.error) {
      console.log('Pool appears to be in error state, attempting to destroy and recreate...');
      await destroyConnectionPool();
      console.log('Pool destroyed, waiting 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Test basic connection
    console.log('\n2. Testing database connection...');
    try {
      await db.raw('SELECT 1 as test');
      console.log('✓ Database connection successful');
      
      const newStatus = getPoolStatus();
      console.log('New pool status:', newStatus);
    } catch (error) {
      console.error('✗ Database connection failed:', error.message);
      
      if (error.message.includes('pool') || error.message.includes('timeout')) {
        console.log('\n3. Attempting full pool reset...');
        await resetPool();
      }
    }

    console.log('\n=== Pool Reset Complete ===');
    
  } catch (error) {
    console.error('Error during pool reset:', error);
  } finally {
    // Always close connections when done
    await db.destroy();
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  resetDatabasePool();
}

module.exports = { resetDatabasePool }; 