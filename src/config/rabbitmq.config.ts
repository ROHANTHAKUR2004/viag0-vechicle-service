import amqp, { Connection, Channel, ConsumeMessage } from "amqplib";

class RabbitMQ {
  private connection: Connection | null = null;
  private channels: { [queue: string]: Channel } = {}; // Store channels by queue name

  // Connect to RabbitMQ
  private async connect(): Promise<void> {
    if (!this.connection) {
      this.connection = await amqp.connect("amqps://kicfbnfs:VA-HZ6A5kJIRQMIVdaa0HiPl-attZtAK@campbell.lmq.cloudamqp.com/kicfbnfs");
      // this.connection = await amqp.connect("amqp://127.0.0.1");

      console.log("Connected to RabbitMQ");
    }
  }

  // Create a channel for a specific queue
  private async createChannel(queue: string): Promise<void> {
    if (!this.channels[queue]) {
      if (!this.connection) {
        await this.connect();
      }

      if (this.connection) {
        const channel = await this.connection.createChannel();
        await channel.assertQueue(queue, { durable: true });
        this.channels[queue] = channel;
        console.log(`Channel created for queue '${queue}'`);
      }
    }
  }

  // Send a message to a specific queue
  public async sendMessage(queue: string, message: string): Promise<void> {
    await this.createChannel(queue); // Ensure the channel is created
    const channel = this.channels[queue];

    if (channel) {
      // Check if the channel is not null
      channel.sendToQueue(queue, Buffer.from(message), {
        persistent: true,
      });
      console.log(`Message sent to queue '${queue}': ${message}`);
    } else {
      console.error(
        `Failed to send message: Channel for queue '${queue}' is not available.`
      );
    }
  }

  // Receive messages from a specific queue
  public async receiveMessages(
    queue: string,
    callback: (msg: ConsumeMessage | null) => void
  ): Promise<void> {
    await this.createChannel(queue); // Ensure the channel is created
    const channel = this.channels[queue];

    if (channel) {
      // Check if the channel is not null
      channel.consume(
        queue,
        (msg) => {
          if (msg !== null) {
            console.log(
              `Received message from '${queue}': ${msg.content.toString()}`
            );
            callback(msg);
            channel.ack(msg); // Acknowledge message
          }
        },
        { noAck: false }
      );

      console.log(`Waiting for messages in queue '${queue}'...`);
    } else {
      console.error(
        `Failed to receive messages: Channel for queue '${queue}' is not available.`
      );
    }
  }

  // Close the RabbitMQ connection
  public async close(): Promise<void> {
    for (const queue in this.channels) {
      await this.channels[queue].close();
      console.log(`Channel closed for queue '${queue}'`);
    }

    if (this.connection) {
      await this.connection.close();
      console.log("Connection closed");
    }
  }
}

const rabbitMQ = new RabbitMQ();
export default rabbitMQ;
