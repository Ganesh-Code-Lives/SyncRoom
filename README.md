# 🚀 SyncRoom

SyncRoom is a real-time watch-together platform that allows users to watch videos, chat, communicate via voice, and share screens in synchronized rooms.

Built using React, Node.js, Socket.IO, WebRTC, and Mediasoup, SyncRoom focuses on creating a seamless shared viewing experience for friends, study groups, and online communities.

---

## 🌐 Live Demo

https://syncroom.live

---

## ✨ Features

### 🎬 Synchronized Media Playback
- Watch YouTube videos together
- Play direct MP4/video URLs
- Host-controlled synchronization
- Automatic playback state updates
- Drift correction for synchronized viewing

### 💬 Real-Time Chat
- Instant messaging
- Room-wide communication
- Live message delivery using Socket.IO

### 🎤 Voice Communication
- High-quality real-time voice chat
- Built using WebRTC and Mediasoup SFU
- Multiple participants supported
- Low latency audio transmission

### 🖥 Screen Sharing
- Share your screen with room participants
- Useful for presentations, study sessions, and collaborative viewing

### 🔗 Room Management
- Create rooms instantly
- Join via Room Code
- Join via Invite Link
- Room ownership and host controls

### ☁️ Production Deployment
- Hosted on AWS EC2
- Nginx reverse proxy
- HTTPS support
- WebSocket support
- PM2 process management

---

<img width="1823" height="868" alt="image" src="https://github.com/user-attachments/assets/339bd2c3-f6f7-4da5-90ad-8219c31f981b" />

<img width="1900" height="891" alt="image" src="https://github.com/user-attachments/assets/4e870320-a23a-426b-9ae0-36b221072be0" />


<table>
  <tr>
    <td><img src="https://github.com/user-attachments/assets/0ce46a68-417d-4966-ace4-98cc5b62f20a" width="220"/></td>
    <td><img src="https://github.com/user-attachments/assets/f563d049-d2ca-4547-be31-682bbbe75bdd" width="220"/></td>
    <td><img src="https://github.com/user-attachments/assets/ed5b85a4-88c8-4744-bb78-5ab732b2b32c" width="220"/></td>
    <td><img src="https://github.com/user-attachments/assets/1e765014-2009-48db-b6d7-23664be4691d" width="220"/></td>
  </tr>
</table>

## 🏗️ System Architecture

```text
Frontend (React)
       │
       ▼
Socket.IO Signaling
       │
       ▼
Node.js + Express
       │
       ▼
Mediasoup SFU
       │
       ▼
WebRTC Clients
```

## 🛠 Tech Stack

### Frontend
- React.js
- React Router
- Tailwind CSS
- Socket.IO Client
- WebRTC APIs

### Backend
- Node.js
- Express.js
- Socket.IO
- Mediasoup

### Deployment
- AWS EC2
- Nginx
- PM2
- Let's Encrypt SSL

### Authentication
- Firebase Authentication


## 🎥 Mediasoup Configuration

The application uses **Mediasoup SFU** for scalable real-time communication.

### Features

* RTP Transport Management
* Producer / Consumer Architecture
* Multiple Workers
* Audio Streaming
* Screen Sharing Support

---

## 📂 Project Structure

```text
syncroom
│
├── client
│   ├── src
│   ├── components
│   ├── pages
│   └── services
│
├── server
│   ├── mediasoup
│   ├── sockets
│   ├── routes
│   └── config
│
└── README.md
```

---

## 🏆 Key Challenges Solved

### Real-Time Synchronization

Implemented a host-authoritative synchronization system that keeps playback synchronized across participants while minimizing playback drift.

### Scaling Beyond P2P

Migrated from a peer-to-peer architecture to a Mediasoup SFU architecture to eliminate bandwidth bottlenecks and improve scalability for multiple participants.

### Production Deployment

Configured AWS EC2, Nginx, SSL, and PM2 to support secure WebSocket connections and reliable production deployment.

---

## 🚀 Future Improvements

* 📁 Video Upload Support
* 📊 User Dashboard & Activity Tracking
* 🎭 User Presence Indicators
* 📺 Multi-Source Streaming
* 🔔 Notifications
* 📱 Mobile Optimization
* 🤖 AI-Powered Recommendations

---

## 📚 What I Learned

Building SyncRoom provided practical experience with:

* WebRTC Internals
* Mediasoup SFU Architecture
* Socket.IO Signaling
* AWS Deployment
* Reverse Proxy Configuration
* Real-Time System Design
* Production Debugging
* Performance Optimization

---

## 👨‍💻 Author

**Ganesh Mamidisethy**

MCA Student — VESIT Mumbai

### Connect With Me

* LinkedIn: https://www.linkedin.com/in/ganesh-mamidisethy
* GitHub: https://github.com/Ganesh-Code-Lives

---

## ⭐ Support

If you found this project interesting, consider giving it a star ⭐

It helps support future development and improvements.
