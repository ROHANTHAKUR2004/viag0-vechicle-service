// @ts-ignore
import * as amqp from "amqplib";

class RabbitMQ {
  private connection: any = null;
  private channels: { [queue: string]: any } = {};

  private async connect(): Promise<void> {
    if (!this.connection) {
      this.connection = await amqp.connect("amqps://kicfbnfs:VA-HZ6A5kJIRQMIVdaa0HiPl-attZtAK@campbell.lmq.cloudamqp.com/kicfbnfs");
      console.log("Connected to RabbitMQ");
    }
  }

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

  public async sendMessage(queue: string, message: string): Promise<void> {
    await this.createChannel(queue);
    const channel = this.channels[queue];

    if (channel) {
      channel.sendToQueue(queue, Buffer.from(message), {
        persistent: true,
      });
      console.log(`Message sent to queue '${queue}': ${message}`);
    } else {
      console.error(`Failed to send message: Channel for queue '${queue}' is not available.`);
    }
  }

  public async receiveMessages(
    queue: string,
    callback: (msg: any) => void
  ): Promise<void> {
    await this.createChannel(queue);
    const channel = this.channels[queue];

    if (channel) {
      channel.consume(
        queue,
        (msg: any) => {
          if (msg !== null) {
            console.log(`Received message from '${queue}': ${msg.content.toString()}`);
            callback(msg);
            channel.ack(msg);
          }
        },
        { noAck: false }
      );
      console.log(`Waiting for messages in queue '${queue}'...`);
    } else {
      console.error(`Failed to receive messages: Channel for queue '${queue}' is not available.`);
    }
  }

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