# Advanced Seat Booking System

A comprehensive, type-safe seat booking system built with Node.js, TypeScript, MongoDB, Redis, RabbitMQ, and Socket.IO. This system provides real-time seat booking capabilities with payment integration, seat locking, and comprehensive error handling.

## 🚀 Features

### Core Functionality
- **Real-time Seat Booking**: Live seat selection and locking with WebSocket updates
- **Payment Integration**: Razorpay payment gateway with webhook support
- **Seat Locking**: Redis-based atomic seat locking with TTL
- **Booking Management**: Complete booking lifecycle management
- **Refund Processing**: Automated refund calculation and processing

### Advanced Features
- **Type Safety**: Full TypeScript implementation with comprehensive type definitions
- **Error Handling**: Robust error handling with custom error classes
- **Rate Limiting**: Built-in rate limiting for API protection
- **Validation**: Request validation using Joi schemas
- **Background Workers**: Automated payment retry, seat cleanup, and booking expiration
- **Real-time Updates**: Socket.IO integration for live updates
- **Message Queue**: RabbitMQ for reliable message processing
- **Caching**: Redis caching for improved performance

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client App    │    │   API Gateway   │    │  Payment Gateway│
│   (Frontend)    │◄──►│   (Express.js)  │◄──►│   (Razorpay)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Application Layer                           │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Controllers   │    Services     │        Middleware           │
│                 │                 │                             │
│ • Booking       │ • Booking       │ • Authentication           │
│ • Vehicle       │ • Payment       │ • Validation               │
│ • Webhook       │ • Search        │ • Error Handling           │
│                 │ • Notification  │ • Rate Limiting            │
└─────────────────┴─────────────────┴─────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Data Layer                                 │
├─────────────────┬─────────────────┬─────────────────────────────┤
│    MongoDB      │      Redis      │        RabbitMQ             │
│                 │                 │                             │
│ • Bookings      │ • Seat Locks    │ • Message Queue            │
│ • Vehicles      │ • Caching       │ • Notifications            │
│ • Transactions  │ • Sessions      │ • Background Jobs          │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

## 📦 Installation

### Prerequisites
- Node.js (v16 or higher)
- MongoDB
- Redis
- RabbitMQ

### Environment Variables
Create a `.env` file with the following variables:

```env
# Server Configuration
NODE_ENV=development
PORT=5001

# Database
MONGO_URI=mongodb://localhost:27017/seat-booking

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key

# Razorpay
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-key-secret
RAZORPAY_WEBHOOK_SECRET=your-razorpay-webhook-secret

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:5173
```

### Install Dependencies
```bash
npm install
```

### Start the Application
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## 🛠️ API Endpoints

### Vehicles
- `GET /api/vehicles/search` - Search for available vehicles
- `POST /api/vehicles/create` - Create a new vehicle
- `GET /api/vehicles/getvechicle` - Get vehicle list

### Bookings
- `POST /api/bookings` - Initiate a new booking
- `POST /api/bookings/confirm` - Confirm booking after payment
- `DELETE /api/bookings/:id` - Cancel a booking
- `GET /api/bookings/:id` - Get booking details
- `GET /api/bookings` - Get user's booking history
- `GET /api/bookings/:id/receipt` - Get booking receipt
- `POST /api/bookings/:id/extend-lock` - Extend seat lock time

### Webhooks
- `POST /api/webhooks/razorpay` - Razorpay webhook endpoint
- `GET /api/webhooks/health` - Webhook health check

## 🔧 Key Components

### 1. Seat Locking System
```typescript
// Atomic seat locking with Redis
const lockResult = await redisCache.lockSeat(
  vehicleId,
  seatNumber,
  userId,
  bookingId,
  ttl // 5 minutes default
);
```

### 2. Payment Processing
```typescript
// Create Razorpay order
const order = await RazorpayService.createOrder({
  amount: totalPrice * 100, // Convert to paise
  currency: 'INR',
  receipt: bookingId,
  notes: { userId, vehicleId }
});
```

### 3. Real-time Updates
```typescript
// Socket.IO event emission
SocketEventEmitter.emitSeatLocked(io, vehicleId, {
  seatNumber,
  bookingId,
  status: 'locked'
});
```

### 4. Background Workers
- **Payment Retry Worker**: Handles failed payment retries
- **Seat Lock Cleanup Worker**: Cleans up expired seat locks
- **Expired Booking Worker**: Processes expired bookings

## 🎯 Usage Examples

### Initiate Booking
```typescript
const bookingRequest = {
  vehicleId: "vehicle123",
  seatNumbers: ["1A", "1B"],
  from: "Mumbai",
  to: "Delhi",
  departureAt: "2024-01-15T10:00:00Z"
};

const response = await fetch('/api/bookings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(bookingRequest)
});
```

### Confirm Payment
```typescript
const paymentData = {
  razorpay_payment_id: "pay_123",
  razorpay_order_id: "order_123",
  razorpay_signature: "signature_123"
};

const response = await fetch('/api/bookings/confirm', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(paymentData)
});
```

### Real-time Socket Connection
```javascript
const socket = io('http://localhost:5001', {
  auth: { token: userToken }
});

// Join vehicle room for real-time updates
socket.emit('join_vehicle', vehicleId);

// Listen for seat updates
socket.on('seat_locked', (data) => {
  console.log('Seat locked:', data);
});

socket.on('booking_confirmed', (data) => {
  console.log('Booking confirmed:', data);
});
```

## 🔒 Security Features

- **JWT Authentication**: Secure user authentication
- **Rate Limiting**: API rate limiting to prevent abuse
- **Input Validation**: Comprehensive request validation
- **Payment Verification**: Razorpay signature verification
- **CORS Protection**: Configurable CORS settings

## 📊 Monitoring & Logging

- **Health Check**: `/health` endpoint for service monitoring
- **Structured Logging**: Comprehensive logging with different levels
- **Error Tracking**: Detailed error logging and tracking
- **Performance Metrics**: Built-in performance monitoring

## 🚀 Deployment

### Docker Deployment
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 5001
CMD ["node", "dist/index.js"]
```

### Environment-Specific Configuration
- **Development**: Full logging, hot reload
- **Production**: Optimized performance, minimal logging
- **Testing**: Test database, mock services

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the API examples

---

Built with ❤️ using TypeScript, Node.js, and modern web technologies.
