"""
Point d'entrée principal pour lancer le serveur Flask DistribDZ.
"""
from dotenv import load_dotenv
from app import create_app

load_dotenv()
app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
