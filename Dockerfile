FROM alpine:latest

RUN apk update && apk upgrade
RUN apk add --update bash curl net-tools

RUN apk add --update nodejs nodejs-npm
ADD ./NLWCompare ./neotys/NLWCompare
RUN cd ./neotys/NLWCompare && npm install

ENTRYPOINT ["tail","-f","/dev/null"]
