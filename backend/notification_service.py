import os
import logging
from typing import Optional, List, Dict

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try importing services, fail gracefully if not installed
try:
    from twilio.rest import Client as TwilioClient
    TWILIO_AVAILABLE = True
except ImportError:
    TWILIO_AVAILABLE = False
    logger.warning("Twilio library not installed.")

try:
    import resend
    RESEND_AVAILABLE = True
except ImportError:
    RESEND_AVAILABLE = False
    logger.warning("Resend library not installed.")


class NotificationService:
    def __init__(self):
        # Twilio Config
        self.twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID")
        self.twilio_token = os.environ.get("TWILIO_AUTH_TOKEN")
        self.twilio_from = os.environ.get("TWILIO_FROM_NUMBER")
        
        self.twilio_client = None
        if TWILIO_AVAILABLE and self.twilio_sid and self.twilio_token:
            try:
                self.twilio_client = TwilioClient(self.twilio_sid, self.twilio_token)
                logger.info("Twilio client initialized.")
            except Exception as e:
                logger.error(f"Failed to initialize Twilio client: {e}")

        # Resend Config
        self.resend_key = os.environ.get("RESEND_API_KEY")
        self.resend_from = os.environ.get("RESEND_FROM_EMAIL", "onboarding@resend.dev")
        
        if RESEND_AVAILABLE and self.resend_key:
            resend.api_key = self.resend_key
            logger.info("Resend client initialized.")

    def send_sms(self, to_number: str, body: str) -> bool:
        """Send an SMS via Twilio."""
        if not self.twilio_client:
            logger.warning("Twilio not configured. SMS not sent.")
            return False
            
        try:
            message = self.twilio_client.messages.create(
                body=body,
                from_=self.twilio_from,
                to=to_number
            )
            logger.info(f"SMS sent to {to_number}: {message.sid}")
            return True
        except Exception as e:
            logger.error(f"Failed to send SMS: {e}")
            return False

    def send_email(self, to_email: str, subject: str, html_content: str) -> bool:
        """Send an email via Resend."""
        if not RESEND_AVAILABLE or not self.resend_key:
            logger.warning("Resend not configured. Email not sent.")
            return False
            
        try:
            params = {
                "from": self.resend_from,
                "to": [to_email],
                "subject": subject,
                "html": html_content,
            }
            email = resend.Emails.send(params)
            logger.info(f"Email sent to {to_email}: {email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False

    def send_welcome_email(self, user_email: str, user_name: str) -> bool:
        """Send a welcome email to a new user."""
        subject = "Benvenuto in Karion Trading OS! 🚀"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; color: #333;">
            <h2>Benvenuto {user_name}!</h2>
            <p>Grazie per esserti unito a <strong>Karion Trading OS</strong>.</p>
            <p>Siamo entusiasti di averti a bordo. La tua piattaforma è pronta per aiutarti a navigare i mercati con l'aiuto dell'AI.</p>
            <p>Ecco cosa puoi fare subito:</p>
            <ul>
                <li>📊 Configura la tua dashboard</li>
                <li>🧠 Fai il tuo primo check-in psicologico</li>
                <li>📉 Analizza i mercati con i nostri strumenti avanzati</li>
            </ul>
            <p>Buon Trading,<br>Il team di Karion</p>
        </div>
        """
        return self.send_email(user_email, subject, html_content)

# Singleton instance
notification_service = NotificationService()
