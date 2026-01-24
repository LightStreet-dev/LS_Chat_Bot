# 1. Вихідний образ Node.js (легкий Alpine)
FROM node:20-alpine

# 2. Робоча директорія всередині контейнера
WORKDIR /app

# 3. Копіюємо package.json та package-lock.json
COPY package*.json ./

# 4. Встановлюємо залежності
RUN npm install --production

# 5. Копіюємо весь код бота
COPY . .

# 6. Порт (не обов'язково для Telegram, але Fly.io може використовувати для health check)
EXPOSE 3000

# 7. Команда для запуску бота
CMD ["node", "bot.js"]
