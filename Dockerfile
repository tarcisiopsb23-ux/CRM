# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

# Build args injetados pelo EasyPanel (Environment Variables → Build Args)
ARG VITE_SUPABASE_URL=https://owwaulaenabbdalycusx.supabase.co
ARG VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93d2F1bGFlbmFiYmRhbHljdXN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4Nzc3NzgsImV4cCI6MjA4NTQ1Mzc3OH0.VKuc4gbKlqjwFnoFJtkAfmzkJxnvz1W1zIfgm2JIvFo
ARG VITE_PUBLIC_ORG_ID=5fb8e8ee-81a6-402b-ab7b-315d1cca6407

# Expõe como ENV para o Vite enxergar durante o build
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_PUBLIC_ORG_ID=$VITE_PUBLIC_ORG_ID

# COPY completo primeiro — garante que mudanças no código invalidam o cache Docker
COPY . .
RUN npm ci --prefer-offline --legacy-peer-deps
RUN npm run build

# Stage 2: Production (nginx)
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

# Nginx configurado para SPA (React Router / client-side routing)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
