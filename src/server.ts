import "dotenv/config";

import app from "./app";

const PORT = process.env.PORT || 5000;

async function main() {
  try {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.log(error);
  }
}

main();