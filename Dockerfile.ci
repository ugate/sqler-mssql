# Specifies where to get the base image and creates a new container for it
FROM node:14

# install C compiler for native node deps
RUN apt-get update && \
    apt-get install -y vim && \
    apt-get install -y software-properties-common build-essential

WORKDIR /home/node/app

COPY . .

RUN mkdir -p docs && \
    ls -al /home/node/app

CMD [ "npm", "run", "test-docker" ]