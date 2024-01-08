const path = require('path')

const express = require('express')

const mountServer = () => {
  const app = express()

  let server = app.listen(5000, () => {
    console.log(`listening on port ${5000}`)
  })

  const io = require('socket.io')(server, {
    allowEI03: true,
  })
  app.use(express.static(path.join(__dirname, '')))

  let userConnections = []

  io.on('connection', (socket) => {
    socket.on('userconnect', (data) => {
      let other_users = userConnections.filter(
        (user) => user.meeting_id === data.meetingid,
      )
      userConnections.push({
        connection_id: socket.id,
        user_id: data.displayName,
        meeting_id: data.meetingid,
      })

      let userCount = userConnections.length;
      other_users.forEach((other_user) => {
        socket.to(other_user.connectionId).emit('inform_others_about_me', {
          other_user_id: data.displayName,
          connId: socket.id,
          userNumber:userCount
        })
      })

      socket.emit('inform_me_about_other_user', other_users)
    })

    socket.on('SDPProcess', (data) => {
      socket.to(data.to_connnectionId).emit('SDPProcess', {
        message: data.message,
        from_connid: socket.id,
      })
    })

    socket.on('sendMessage', (msg) => {
      console.log('msg', msg)
      let messageUser = userConnections.find(
        (user) => user.connectionId === socket.id,
      )
      if (messageUser) {
        let meetingId = messageUser.meeting_id
        let from = messageUser.user_id
        let list = userConnections.filter(
          (user) => user.meeting_id === meetingId,
        )
        list.forEach((l) => {
          socket
            .to(l.connectionId)
            .emit('showChatMessage', { from, message: msg })
        })
      }
    })

    socket.on('disconnect', () => {
      let disconnectedUser = userConnections.find(
        (user) => user.connectionId === socket.id,
      )
      if (disconnectedUser) {
        let meetingId = disconnectedUser.meeting_id
        userConnections = userConnections.filter(
          (user) => user.connectionId !== socket.id,
        )
        let list = userConnections.filter(
          (user) => user.meeting_id === meetingId,
        )
        list.forEach((v) => {
          socket.to(v.connectionId).emit('inform_about_disconnected_user', {
            connectionId: socket.id,
          })
        })
      }
    })
  })
}

mountServer()
