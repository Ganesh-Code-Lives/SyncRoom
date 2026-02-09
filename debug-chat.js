
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

const userId = 'debug-user-' + Date.now();
const userName = 'DebugUser';

console.log('Connecting...');

socket.on('connect', () => {
    console.log('Connected:', socket.id);

    // Create Room
    socket.emit('create_room', {
        userId,
        userName,
        userAvatar: null,
        roomName: 'Debug Room',
        roomType: 'video',
        privacy: 'public'
    }, (response) => {
        console.log('Create Response:', response);

        if (response.success) {
            const roomCode = response.roomCode;
            console.log('Room Created:', roomCode);

            // Send Message
            console.log('Sending message to', roomCode);
            socket.emit('send_message', {
                roomCode,
                message: {
                    senderId: userId,
                    senderName: userName,
                    senderAvatar: null,
                    content: 'Hello from Debug Script!'
                }
            });
        } else {
            console.error('Failed to create room:', response.error);
            process.exit(1);
        }
    });
});

socket.on('new_message', (msg) => {
    console.log('Received Message:', msg);
    if (msg.content === 'Hello from Debug Script!') {
        console.log('SUCCESS: Chat verification passed!');
        socket.disconnect();
        process.exit(0);
    }
});

socket.on('connect_error', (err) => {
    console.error('Connection Error:', err.message);
    process.exit(1);
});

// Timeout
setTimeout(() => {
    console.error('Timeout: No message received back.');
    process.exit(1);
}, 5000);
