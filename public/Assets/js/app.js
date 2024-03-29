var AppProcess = (function () {
  let peers_connection_ids = []
  let peers_connection = []
  let remote_vid_stream = []
  let remote_aud_stream = []
  var serverProcess
  let local_div = ''
  var audio
  let isAudioMute = true
  let rtp_vid_senders = []
  let rtp_aud_senders = []
  let video_states = {
    None: 0,
    Camera: 1,
    ScreenShare: 2,
  }
  let video_state = video_states.None
  var videoCamTrack

  async function _init(SDP_function, myConnId) {
    serverProcess = SDP_function
    my_connection_id = myConnId
    eventProcess()
    local_div = document.querySelector('#localVideoPlayer')
  }

  async function loadAudio() {
    try {
      let astream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      })
      audio = astream.getAudioTracks()[0]
      audio.enabled = false
    } catch (e) {
      console.log(e)
    }
  }

  function connection_status(connection) {
    if (
      connection &&
      (connection.connectionState === 'new' ||
        connection.connectionState === 'connecting' ||
        connection.connectionState === 'connected')
    ) {
      return true
    } else {
      return false
    }
  }

  async function updateMediaSenders(track, rtp_senders) {
    for (var connection_id in peers_connection_ids) {
      if (connection_status(peers_connection[connection_id])) {
        if (rtp_senders[connection_id] && rtp_senders[connection_id].track) {
          rtp_senders[connection_id].replaceTrack(track)
        } else {
          rtp_senders[connection_id] =
            peers_connection[connection_id].addTrack(track)
        }
      }
    }
  }

  function removeMediaSenders(rtp_senders) {
    for (var connection_id in peers_connection_ids) {
      if (
        rtp_senders[connection_id] &&
        connection_status(peers_connection[connection_id])
      ) {
        peers_connection[connection_id].removeTrack(rtp_senders[connection_id])
        rtp_senders[connection_id] = null
      }
    }
  }

  function eventProcess() {
    $('#micMuteUnmute').on('click', async function () {
      if (!audio) {
        await loadAudio()
      }
      if (!audio) {
        alert('Audio permission has not been granted')
        return
      }

      if (isAudioMute) {
        audio.enabled = true
        $(this).html("<span class='material-icons'> mic</span>")
        updateMediaSenders(audio, rtp_aud_senders)
      } else {
        audio.enabled = false
        $(this).html(
          "<span class='material-icons' style='width:100%'>mic_off</span>",
        )
        removeMediaSenders(rtp_aud_senders)
      }
      isAudioMute = !isAudioMute
    })

    $('#videoCamOnOff').on('click', async function () {
      if (video_state === video_states.Camera) {
        await videoProcess(video_states.None)
      } else {
        await videoProcess(video_states.Camera)
      }
    })

    $('#screenShareOnOff').on('click', async function () {
      if (video_state === video_states.ScreenShare) {
        await videoProcess(video_states.None)
      } else {
        await videoProcess(video_states.ScreenShare)
      }
    })
  }

  async function removeVideoStream(rtp_vid_senders) {
    if (videoCamTrack) {
      videoCamTrack.stop()
      videoCamTrack = null
      local_div.srcObject = null
      removeMediaSenders(rtp_vid_senders)
    }
  }

  async function videoProcess(newVideoState) {
    if (newVideoState === video_states.None) {
      $('#videoCamOnOff').html(
        "<span class='material-icons' style='width:100%'>videocam_off</span>",
      )

      $('#screenShareOnOff').html(
        '<span class="material-icons">present_to_all</span><div class="">Present Now</div>',
      )
      video_state = newVideoState
      removeVideoStream(rtp_vid_senders)
      return
    }
    if (newVideoState === video_states.Camera) {
      $('#videoCamOnOff').html(
        "<span class='material-icons' style='width:100%'>videocam_on</span>",
      )
    }
    try {
      let videoStream = null
      if (newVideoState === video_states.Camera) {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 1920,
            height: 1080,
          },
          audio: false,
        })
      } else if (newVideoState === video_states.ScreenShare) {
        videoStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: 1920,
            height: 1080,
          },
          audio: false,
        })
        videoStream.oninactive = (e) => {
          removeVideoStream(rtp_vid_senders)
          $('#screenShareOnOff').html(
            '<span class="material-icons">present_to_all</span><div>Present Now</div>',
          )
        }
      }
      if (videoStream && videoStream.getVideoTracks().length > 0) {
        videoCamTrack = videoStream.getVideoTracks()[0]
        if (videoCamTrack) {
          local_div.srcObject = new MediaStream([videoCamTrack])
          updateMediaSenders(videoCamTrack, rtp_vid_senders)
        }
      }
    } catch (err) {
      console.error(err)
      return
    }

    video_state = newVideoState
    if (newVideoState === video_states.Camera) {
      $('#videoCamOnOff').html(
        "<span class='material-icons' style='width:100%'>videocam</span>",
      )
      $('#screenShareOnOff').html(
        '<span class="material-icons">present_to_all</span><div>Present Now</div>',
      )
    } else if (newVideoState === video_states.ScreenShare) {
      $('#screenShareOnOff').html(
        '<span class="material-icons text-success">present_to_all</span><div class="text-success">Stop Present</div>',
      )
      $('#videoCamOnOff').html(
        "<span class='material-icons' style='width:100%'>videocam_off</span>",
      )
    }
  }

  let iceConfiguration = {
    iceServers: [
      {
        urls: 'stun:stun.l.google.com:19302',
      },
      {
        urls: 'stun:stun1.l.google.com:19302',
      },
    ],
  }
  async function setConnection(connectionId) {
    var connection = new RTCPeerConnection(iceConfiguration)

    connection.onnegotiationneeded = async function (event) {
      await setOffer(connectionId)
    }

    connection.onicecandidate = function (event) {
      if (event.candidate) {
        serverProcess(
          JSON.stringify({ icecandidate: event.candidate }),
          connectionId,
        )
      }
    }

    connection.ontrack = function (event) {
      if (!remote_vid_stream[connectionId]) {
        remote_vid_stream[connectionId] = new MediaStream()
      }
      if (!remote_aud_stream[connectionId]) {
        remote_aud_stream[connectionId] = new MediaStream()
      }

      if (event.track.kind == 'video') {
        remote_vid_stream[connectionId]
          .getVideoTracks()
          .forEach((t) => remote_vid_stream[connectionId].removeTrack(t))

        remote_vid_stream[connectionId].addTrack(event.track)

        let remoteVideoPlayer = document.querySelector('#v_' + connectionId)
        remoteVideoPlayer.srcObject = null
        remoteVideoPlayer.srcObject = remote_vid_stream[connectionId]
        remoteVideoPlayer.load()
      } else if (event.track.kind === 'audio') {
        remote_aud_stream[connectionId]
          .getAudioTracks()
          .forEach((t) => remote_aud_stream[connectionId].removeTrack(t))

        remote_aud_stream[connectionId].addTrack(event.track)

        let remoteAudioPlayer = document.querySelector('#a_' + connectionId)
        remoteAudioPlayer.srcObject = null
        remoteAudioPlayer.srcObject = remote_aud_stream[connectionId]
        remoteAudioPlayer.load()
      }
    }
    peers_connection_ids[connectionId] = connectionId
    peers_connection = connection

    if (
      video_state === video_states.Camera ||
      video_state === video_states.ScreenShare
    ) {
      if (videoCamTrack) {
        updateMediaSenders(videoCamTrack, rtp_vid_senders)
      }
    }

    return connection
  }

  async function setOffer(connectionId) {
    let connection = peers_connection[connectionId]
    let offer = await connection.createOffer()

    await connection.setLocalDescription(offer)
    serverProcess(
      JSON.stringify({ offer: connection.localDescription }),
      connectionId,
    )
  }

  async function SDPProcess(message, from_connid) {
    message = JSON.parse(message)
    if (message.answer) {
      await peers_connection[from_connid].setRemoteDescription(
        new RTCSessionDescription(message.answer),
      )
    } else if (message.offer) {
      if (!peers_connection[from_connid]) {
        await setConnection(from_connid)
      }
      await peers_connection[from_connid].setRemoteDescription(
        new RTCSessionDescription(message.offer),
      )
      let answer = await peers_connection[from_connid].createAnswer()
      await peers_connection[from_connid].setLocalDescription(answer)
      serverProcess(JSON.stringify({ answer }), from_connid)
    } else if (message.icecandidate) {
      if (!peers_connection[from_connid]) {
        await setConnection(from_connid)
      }
      try {
        await peers_connection[from_connid].addIceCandidate(
          message.icecandidate,
        )
      } catch (err) {
        console.error(err)
      }
    }
  }

  async function closeConnection(connectionId) {
    peers_connection_ids[connectionId] = null
    if (peers_connection[connectionId]) {
      peers_connection[connectionId].close()
      peers_connection[connectionId] = null
    }

    if (remote_aud_stream[connectionId]) {
      remote_aud_stream[connectionId].getTracks().forEach((t) => {
        if (t.stop) t.stop()
      })
      remote_aud_stream[connectionId] = null
    }
    if (remote_vid_stream[connectionId]) {
      remote_vid_stream[connectionId].getTracks().forEach((t) => {
        if (t.stop) t.stop()
      })
      remote_vid_stream[connectionId] = null
    }
  }

  return {
    setNewConnection: async function (connectionId) {
      await setConnection(connectionId)
    },
    init: async function (SDP_function, my_connectionId) {
      await _init(SDP_function, my_connectionId)
    },
    processClientFunc: async function (data, from_connid) {
      await SDPProcess(data, from_connid)
    },
    closeConnectionCall: async function (connectionId) {
      await closeConnection(connectionId)
    },
  }
})()

var MyApp = (function () {
  var socket = null
  let user_id = ''
  let meeting_id = ''
  function init(uid, mid) {
    user_id = uid
    meeting_id = mid
    $('#meetingContainer').show()
    $('#me h2').text(user_id + '(Me)')
    document.title = user_id
    event_process_for_signaling_server()
    eventHandling()
  }

  function event_process_for_signaling_server() {
    socket = io.connect()

    let SDP_function = function (data, to_connectionId) {
      socket.emit('SDPProcess', {
        message: data,
        to_connectionId,
      })
    }

    socket.on('connect', () => {
      if (socket.connected) {
        AppProcess.init(SDP_function, socket.id)
        if (user_id !== '' || meeting_id !== '') {
          socket.emit('userconnect', {
            displayName: user_id,
            meetingid: meeting_id,
          })
        }
      }
    })

    socket.on('inform_about_disconnected_user', (data) => {
      $('#' + data.connectionId).remove()
      $('.participant-count').text(data.userNumber)
      $('#participant_' + data.connectionId + '').remove()
      AppProcess.closeConnectionCall(data.connectionId)
    })

    socket.on('inform_others_about_me', (data) => {
      console.log('data', data)
      addUser(data.other_user_id, data.connId, data.userNumber)
      AppProcess.setNewConnection(data.connId)
    })

    socket.on('showFileMessage', function (data) {
      let time = new Date()
      let lTime = time.toLocaleString('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      })
      let attachFileAreaForOther = document.querySelector('.show-attach-file')

      attachFileAreaForOther.innerHTML +=
        "<div class'left-align' style='display: flex; align-items:center;'><img src='public/assets/images/other.jpg' style='height:40px;width:40px;' class='caller-image-circle'><div style='font-weight: 600;margin: 0 5px;'>" +
        data.username +
        "</div>:<div><a style='color:#007bff;' href='" +
        data.filePath +
        "' download>" +
        data.fileName +
        '</a></div></div><br/>'
    })

    socket.on('inform_me_about_other_user', (other_users) => {
      let userNumber = other_users.length
      let userNum = userNumber + 1
      if (other_users) {
        for (let i = 0; i < other_users.length; i++) {
          addUser(other_users[i].user_id, other_users[i].connection_id, userNum)
          AppProcess.setNewConnection(other_users[i].connection_id)
        }
      }
    })

    socket.on('SDPProcess', async function (data) {
      await AppProcess.processClientFunc(data.message, data.from_connid)
    })

    socket.on('showChatMessage', (data) => {
      console.log('data', data)
      let time = new Date()
      let lTime = time.toLocaleString('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      })
      let div = $('<div>').html(
        "<span class='font-weight-bold' style='color:black'>" +
          data.from +
          '</span>' +
          lTime +
          '</br>' +
          data.message,
      )

      $('#messages').append(div)
    })
  }

  function eventHandling() {
    $('#btnsend').on('click', () => {
      let messageData = $('#msgbox').val()
      socket.emit('sendMessage', messageData)
      let time = new Date()
      let lTime = time.toLocaleString('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      })
      let div = $('<div>').html(
        "<span class='font-weight-bold' style='color:black'>" +
          user_id +
          '</span>' +
          lTime +
          '</br>' +
          messageData,
      )

      $('#messages').append(div)
      $('#msgbox').val('')
    })
    let url = window.location.href
    $('.meeting_url').text(url)

    $('#divUsers').on('dblclick', 'video', function () {
      this.requestFullscreen()
    })
  }

  function addUser(otherUserId, connectionId, userNumber) {
    let newDivId = $('#otherTemplate').clone()
    newDivId = newDivId.attr('id', connectionId).addClass('other')
    newDivId.find('h2').text(otherUserId)
    newDivId.find('video').attr('id', 'v_' + connectionId)
    newDivId.find('audio').attr('id', 'a_' + connectionId)
    newDivId.show()

    $('#divUsers').append(newDivId)
    $('.in-call-wrap-up').append(
      '<div class="in-call-wrap d-flex justify-content-between align-items-center mb-3" id="participant_' +
        connectionId +
        '"><div class="participant-img-name-wrap display-center cursor-pointer"><div class="participant-img"><img src="public/Assets/images/other.jpg" alt="" class="border border-secondary"style="height: 40px; width: 40px; border-radius: 50%" /></div><div class="participant-name ml-2">' +
        otherUserId +
        '</div></div><div class="participant-action-wrap display-center"><div class="participant-action-dot display-center mr-2 cursor-pointer">                   <span class="material-icons">more_vert</span></div><div class="participant-action-pin display-center mr-2 cursor-pointer"><span class="material-icons">push_pin</span></div></div></div>',
    )
    $('.participant-count').text(userNumber)
  }
  $(document).on('click', '.people-heading', function () {
    $('.in-call-wrap-up').show(300)
    $('.chat-show-wrap').hide(300)
    $(this).addClass('active')
    $('.chat-heading').removeClass('active')
  })
  $(document).on('click', '.chat-heading', function () {
    $('.in-call-wrap-up').hide(300)
    $('.chat-show-wrap').show(300)
    $(this).addClass('active')
    $('.people-heading').removeClass('active')
  })

  $(document).on('click', '.meeting-heading-cross', () => {
    $('.g-right-details-wrap').hide(300)
    $('.people-heading').removeClass('active')
    $('.chat-heading').removeClass('active')
  })
  $(document).on('click', '.top-left-participant-wrap', function () {
    $('.g-right-details-wrap').show(300)
    $('.in-call-wrap-up').show(300)
    $('.chat-show-wrap').hide(300)
    $('.people-heading').addClass('active')
    $('.chat-heading').removeClass('active')
  })
  $(document).on('click', '.top-left-chat-wrap', function () {
    $('.g-right-details-wrap').show(300)
    $('.in-call-wrap-up').hide(300)
    $('.chat-show-wrap').show(300)
    $('.chat-heading').addClass('active')
    $('.people-heading').removeClass('active')
  })
  $(document).on('click', '.end-call-wrap', () => {
    $('.top-box-show')
      .css({
        display: 'block',
      })
      .html(
        '<div class="top-box align-vertical-middle profile-dialogue-show" style="font-size:14px;"><h1 class="mt-2 text-center text-light">Leave Meeting</h1><div class="call-leave-cancel-action d-flex justify-content-center align-items-center w-100"><a href="./action.html"><button class="call-leave-action btn btn-danger mr-5">Leave</button></a><button type="button" class="call-cancel-action btn btn-secondary">Cancel</button></div></div>',
      )
  })

  $(document).mouseup(function (e) {
    let container = new Array()
    container.push($('.top-box-show'))
    $.each(container, function (key, value) {
      if (!$(value).is(e.target) && $(value).has(e.target).length === 0) {
        $(value).empty()
      }
    })
  })

  $(document).mouseup(function (e) {
    let container = new Array()
    container.push($('.g-details'))
    container.push($('.g-right-details-wrap'))
    $.each(container, function (key, value) {
      if (!$(value).is(e.target) && $(value).has(e.target).length === 0) {
        $(value).hide(300)
      }
    })
  })

  $(document).on('click', '.call-cancel-action', function () {
    $('.top-box-show').html('')
  })

  $(document).on('click', '.copy_info', function () {
    let $temp = $('<input>')
    $('body').append($temp)
    $temp.val($('.meeting_url').text()).select()
    document.execCommand('copy')
    $temp.remove()
    $('.link-conf').show()
    setTimeout(() => {
      $('.link-conf').hide()
    }, 3000)
  })

  $(document).on('click', '.meeting-details-button', function () {
    $('.g-details').slideDown(300)
    // $('.g-details-heading-detail').addClass('active')
    // $('.g-details-heading-attachment').removeClass('active')
  })

  $(document).on('click', '.g-details-heading-attachment', function () {
    $('.g-details-heading-show').hide()
    $('.g-details-heading-show-attachment').show()
    $(this).addClass('active')
    $('.g-details-heading-detail').removeClass('active')
  })

  $(document).on('click', '.g-details-heading-detail', function () {
    $('.g-details-heading-show').show()
    $('.g-details-heading-show-attachment').hide()
    $(this).addClass('active')
    $('.g-details-heading-attachment').removeClass('active')
  })

  let base_url = window.location.origin

  $(document).on('onchange', '.custom-file-input', function (e) {
    let fileName = $(this).val().split('\\').pop()
    $(this).siblings('.custom-file-label').addClass('selected').html(fileName)
  })

  $(document).on('click', '.share-attach', function (e) {
    e.preventDefault()
    let att_img = $('#customFile').prop('files')[0]
    let formData = new FormData()

    formData.append('zipfile', att_img)
    formData.append('meeting_id', meeting_id)
    formData.append('username', user_id)

    $.ajax({
      url: base_url + '/attachimg',
      type: 'POST',
      data: formData,
      contentType: false,
      processData: false,
      success: function (response) {
        console.log('response', response)
      },
      error: function () {
        console.error('error')
      },
    })
    let attachFileArea = document.querySelector('.show-attach-file')
    let attachFileName = $('#customFile').val().split('\\').pop()
    let attachFilePath =
      'public/attachment/' + meeting_id + '/' + attachFileName

    attachFileArea.innerHTML +=
      "<div class'left-align' style='display: flex; align-items:center;'><img src='public/assets/images/other.jpg' style='height:40px;width:40px;' class='caller-image-circle'><div style='font-weight: 600;margin: 0 5px;'>" +
      user_id +
      "</div>:<div><a style='color:#007bff;' href='" +
      attachFilePath +
      "' download>" +
      attachFileName +
      '</a></div></div><br/>'

    $('label.custom-file-label').text('')
    socket.emit('fileTransferToOther', {
      username: user_id,
      meetingid: meeting_id,
      filePath: attachFilePath,
      fileName: attachFileName,
    })
  })

  $(document).on('click', '.option-icon', function () {
    $('.recording-show').toggle(300)
  })

  $(document).on('click', '.start-record', function () {
    $(this)
      .removeClass()
      .addClass('stop-record btn-danger text-dark')
      .text('Stop recording')
    startRecording()
  })

  $(document).on('click', '.stop-record', function () {
    $(this)
      .removeClass()
      .addClass('start-record btn-dark text-danger')
      .text('Start recording')
    mediaRecorder.stop()
  })

  async function captureScreen(mediaContraints = { video: true }) {
    return await navigator.mediaDevices.getDisplayMedia(mediaContraints)
  }

  async function captureAudio(mediaContraints = { audio: true, video: false }) {
    return await navigator.mediaDevices.getUserMedia(mediaContraints)
  }
  var mediaRecorder
  var chunks = []
  async function startRecording() {
    const screenStream = await captureScreen()
    let audioStream = await captureAudio()
    const stream = new MediaStream([
      ...screenStream.getTracks(),
      ...audioStream.getTracks(),
    ])
    mediaRecorder = new MediaRecorder(stream)
    mediaRecorder.start()
    mediaRecorder.onstop = function (e) {
      let clipName = prompt('Enter a name for your recording')
      stream.getTracks().forEach((track) => track.stop())
      const blob = new Blob(chunks, { type: 'video/webm' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')

      a.style.display = 'none'
      a.href = url
      a.download = clipName + '.webm'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      }, 100)
    }

    mediaRecorder.ondataavailable = function (e) {
      chunks.push(e.data)
    }
  }

  return {
    _init: function (uid, mid) {
      init(uid, mid)
    },
  }
})()
