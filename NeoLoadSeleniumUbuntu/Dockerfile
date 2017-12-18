## origin: https://github.com/dockerfile/ubuntu/blob/master/Dockerfile

FROM ubuntu:14.04

# Install.
RUN \
  sed -i 's/# \(.*multiverse$\)/\1/g' /etc/apt/sources.list && \
  apt-get update && \
  apt-get -y upgrade && \
  apt-get install -y build-essential && \
  apt-get install -y software-properties-common && \
  apt-get install -y byobu curl git htop man unzip vim wget && \
  rm -rf /var/lib/apt/lists/*

# Add files.
ADD root/.bashrc /root/.bashrc
ADD root/.gitconfig /root/.gitconfig
ADD root/.scripts /root/.scripts

# Set environment variables.
ENV HOME /root

# Define working directory.
WORKDIR /root



## origin: https://github.com/dockerfile/ubuntu-desktop/blob/master/Dockerfile

# Install LXDE and VNC server.
RUN \
  apt-get update && \
  DEBIAN_FRONTEND=noninteractive apt-get install -y lxde-core lxterminal tightvncserver && \
  rm -rf /var/lib/apt/lists/*

# Define working directory.
WORKDIR /data

# Define default command.
#CMD ["bash"]

# Expose ports.
EXPOSE 5901



## Run the NeoLoad bits

ARG NLVERSION
ENV NLVERSION=6.1.2

RUN NL_MAJ_DOT=${a:0:3}
RUN NL_MIN_USC=${NLVERSION//./_}

ENV ARCH=x86
RUN IF $(uname -m | grep -F "64") THEN; ARCH=x64; FI

RUN curl ftp://www.neotys.com/neoload/v$NL_MAJ_DOT/neoload_$NL_MIN_USC_linux_$ARCH.sh -o /tmp/nl.sh
RUN chmod a+x /tmp/nl.sh
RUN /tmp/nl.sh

RUN apt-get install lsof &
RUN wait $!
#RUN sed -i 's/agent.server.port=7100/agent.server.port=7102/g' /neoload$NL_MAJ_DOT/conf/agent.properties &
#RUN wait $!
RUN /bin/sh -c /neoload$NL_MAJ_DOT/bin/LoadGeneratorAgent &
RUN PID=$!
RUN ps -aux
RUN tail -f /proc/$PID/fd/1
