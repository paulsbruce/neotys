#!/bin/bash

which docker

if [ $? -eq 0 ]
then
    docker --version | grep "Docker version"
    dip=''
    if [ $? -eq 0 ]
    then
        #dip=$(docker-machine ip) # on mac, no machine
        echo "Yay! Docker is installed! $dip"
    else
        echo "install docker"
        exit
    fi
else
    echo "install docker" >&2
    exit
fi

[ "$UID" -eq 0 ] || exec sudo bash "$0" "$@"

for i in jenkins nts ushahidi mysql-ushahidi cadvisor loadgenerator1 loadgenerator2; do
  if ! grep -q "$i" /etc/hosts; then echo "0.0.0.0  $i" >> /etc/hosts; fi
done

docker-compose up
