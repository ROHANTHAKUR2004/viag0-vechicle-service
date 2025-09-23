import Razorpay from "razorpay";


// const key_id = "";
// const key_secret = process.env.RAZORPAY_KEY_SECRET;


const key_id = "rzp_test_7dU2Zk3usqjmRX"
const key_secret ="AtoGFb47DrDC0hdZfXR9dnCi"

console.log("razorpay ids", key_id, key_secret);

if (!key_id || !key_secret) {
  throw new Error('Razorpay key_id or key_secret is missing in environment variables');
}

export const razorpayInstance = new Razorpay({
  key_id,
  key_secret,
});
