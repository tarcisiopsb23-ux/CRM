# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

# Variáveis de ambiente para o build do Vite (Estratégia Infalível para EasyPanel sem Build Args)
ENV VITE_SUPABASE_URL=https://owwaulaenabbdalycusx.supabase.co
ENV VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93d2F1bGFlbmFiYmRhbHljdXN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4Nzc3NzgsImV4cCI6MjA4NTQ1Mzc3OH0.VKuc4gbKlqjwFnoFJtkAfmzkJxnvz1W1zIfgm2JIvFo

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Production
FROM nginx:alpine

# Copia os arquivos gerados pelo Vite para o diretório do Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Configuração básica do Nginx para Single Page Apps (React/Vite)
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
