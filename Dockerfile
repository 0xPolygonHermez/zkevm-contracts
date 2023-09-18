FROM node:16.18

WORKDIR /app
COPY . /app
RUN apt-get update && apt-get install curl jq -y
RUN npm i
RUN npm run compile
RUN mkdir outputs
