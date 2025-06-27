const { db } = require("./src/config/db")

async function generateMockAttendanceData() {
  try {
    console.log('Starting mock attendance data generation...')

    // Get all active users
    const users = await db('users')
      .where('active', true)
      .select('id', 'name')

    if (users.length === 0) {
      console.log('No active users found')
      return
    }

    console.log(`Found ${users.length} active users`)

    // Generate data for January to June
    const months = [0, 1, 2, 3, 4, 5] // 0 = January, 5 = June
    const year = 2024

    // First, clear existing attendance records for this period
    const startDate = new Date(year, 0, 1) // January 1st
    const endDate = new Date(year, 5, 30) // June 30th
    
    console.log('Clearing existing attendance records...')
    await db('attendance')
      .whereBetween('timestamp', [startDate, endDate])
      .del()

    for (const month of months) {
      const startDate = new Date(year, month, 1)
      const endDate = new Date(year, month + 1, 0)
      const daysInMonth = endDate.getDate()

      console.log(`Generating data for ${startDate.toLocaleString('default', { month: 'long' })} ${year}`)

      for (const user of users) {
        console.log(`Processing user: ${user.name}`)
        
        // For each day in the month
        for (let day = 1; day <= daysInMonth; day++) {
          const currentDate = new Date(year, month, day)
          
          // Skip weekends
          if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
            continue
          }

          // Randomly decide attendance status
          const random = Math.random()
          
          // 80% chance of attendance
          if (random < 0.8) {
            // Generate check-in time (between 7:30 AM and 9:30 AM)
            const checkInHour = 7 + Math.floor(Math.random() * 2)
            const checkInMinute = Math.floor(Math.random() * 60)
            const checkInTime = new Date(year, month, day, checkInHour, checkInMinute)
            
            // Generate check-out time (between 4:00 PM and 6:00 PM)
            const checkOutHour = 16 + Math.floor(Math.random() * 2)
            const checkOutMinute = Math.floor(Math.random() * 60)
            const checkOutTime = new Date(year, month, day, checkOutHour, checkOutMinute)

            // Generate mock QR IDs for check-in and check-out
            const checkInQrId = `QR-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            const checkOutQrId = `QR-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

            // Insert check-in record
            await db('attendance').insert({
              id: `ATT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
              user_id: user.id,
              type: 'check-in',
              timestamp: checkInTime,
              status: checkInHour >= 9 ? 'late' : 'valid',
              location: JSON.stringify({latitude: 0, longitude: 0}),
              device_info: 'MOCK_DATA',
              qr_id: checkInQrId,
              ip_address: '127.0.0.1'
            })

            // Insert check-out record
            await db('attendance').insert({
              id: `ATT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
              user_id: user.id,
              type: 'check-out',
              timestamp: checkOutTime,
              status: 'valid',
              location: JSON.stringify({latitude: 0, longitude: 0}),
              device_info: 'MOCK_DATA',
              qr_id: checkOutQrId,
              ip_address: '127.0.0.1'
            })
          }
          // 10% chance of leave
          else if (random < 0.9) {
            // Create leave request if doesn't exist
            const existingLeave = await db('leave_requests')
              .where('user_id', user.id)
              .whereBetween('start_date', [startDate, endDate])
              .first()

            if (!existingLeave) {
              await db('leave_requests').insert({
                id: `LV-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
                user_id: user.id,
                type: 'annual',
                start_date: currentDate,
                end_date: currentDate,
                status: 'approved',
                reason: 'Personal leave',
                created_at: currentDate,
                updated_at: currentDate
              })
            }
          }
          // 10% chance of absence without leave
        }
      }

      console.log(`Completed data generation for ${startDate.toLocaleString('default', { month: 'long' })} ${year}`)
    }

    console.log('Mock attendance data generation completed successfully')
  } catch (error) {
    console.error('Error generating mock data:', error)
    throw error
  }
}

// Execute if running directly
if (require.main === module) {
  generateMockAttendanceData()
    .then(() => {
      console.log('Successfully completed mock data generation')
      process.exit(0)
    })
    .catch(error => {
      console.error('Failed to generate mock data:', error)
      process.exit(1)
    })
}

module.exports = { generateMockAttendanceData } 