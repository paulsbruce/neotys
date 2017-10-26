#!/bin/bash

declare -a hostnames
hostnames=(jenkins nts ushahidi mysql-ushahidi cadvisor loadgenerator1 loadgenerator2 nlweb)

# if any host entries necessary, restart script in elevated to write host names
requires_elevation=0
for i in $hostnames; do
  if ! grep -q "$i" /etc/hosts; then requires_elevation=1; fi
done

if [ "$requires_elevation" -eq 1 ]; then
  echo 'To proceed, a few host names have to be added to map demo hosts to Docker containers.'
  echo 'Please elevate to sudo to proceed.'
  [ "$UID" -eq 0 ] || exec sudo bash "$0" "$@"
fi


# check for docker installed, if not exit
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

# add host entries
for i in $hostnames; do
  if ! grep -q "$i" /etc/hosts; then echo "0.0.0.0  $i" >> /etc/hosts; fi
done

# make sure data directories exist for NeoLoadWeb mongo back-end
mkdir -p nlweb/mongo/db
mkdir -p nlweb/mongo/backup

function wait_for_ready() {
  local cpid=$1

  echo 'Waiting for containers to spin up. Will launch a browser window to target app once ready...'
  until [ "$(curl --silent --show-error --connect-timeout 1 -I http://nlweb:9090 | grep '200 OK')" ];
  do
      sleep 5
      if ps -p $cpid > /dev/null ; then printf '.'; else exit; fi
  done

  if ps -p $cpid > /dev/null ; then printf '.'; else exit; fi

  # warm up each of the web front-ends
  curl -s 'http://jenkins:8081' > /dev/null
  curl -s 'http://nts:8888' > /dev/null
  curl -s 'http://ushahidi:80' > /dev/null
  curl -s 'http://cadvisor:7777' > /dev/null
  curl -s 'http://nlweb:9090' > /dev/null

  # print out important things like all the URLs above, NLW settings, NLS settings, and API keys
  # NLW default admin password: nlweb-password-changeit

  #open 'http://ushahidi/welcome'
  open 'http://nlweb:9090'
}

nohup docker-compose up &
PID=$!
echo "Compose running in process id: $PID"
echo '****************************************************************'
echo '**  Press CTRL+C to exit compose and stop running containers. **'
echo '****************************************************************'

sleep 5s
wait_for_ready $PID &

# trap ctrl-c and call ctrl_c()
trap ctrl_c INT

function ctrl_c() {
        echo "\n** killing compose process, closing containers"
        kill $PID
}

sleep 5s
tail -f nohup.out
