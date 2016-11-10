/**
 * JBoss, Home of Professional Open Source
 * Copyright 2016, Red Hat, Inc. and/or its affiliates, and individual
 * contributors by the @authors tag. See the copyright.txt in the
 * distribution for a full listing of individual contributors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// jshint esnext: true

// zipkin-related
const express = require('express');
const {Tracer, ExplicitContext, BatchRecorder, ConsoleRecorder} = require('zipkin');
const zipkinMiddleware = require('zipkin-instrumentation-express').expressMiddleware;

// chaining
const roi = require('roi');
const circuitBreaker = require('opossum');

// circuit breaker
const circuitOptions = {
  maxFailures: 5,
  timeout: 1000,
  resetTimeout: 10000
};
const nextService = 'hola';
const circuit = circuitBreaker(roi.get, circuitOptions);
circuit.fallback(() => (`The ${nextService} service is currently unavailable.`));

// Using a hardcoded URL from my environment here.
const chainingOptions = {
  endpoint: 'http://hola-myproject.192.168.1.8.xip.io/api/hola'
};

const ctxImpl = new ExplicitContext();
const {HttpLogger} = require('zipkin-transport-http');

var recorder;
if (process.env.ZIPKIN_SERVER_URL === undefined) {
  console.log('No ZIPKIN_SERVER_URL defined. Printing zipkin traces to console.');
  recorder = new ConsoleRecorder();
} else {
  recorder = new BatchRecorder({
    logger: new HttpLogger({
      endpoint: process.env.ZIPKIN_SERVER_URL + '/api/v1/spans'
    })
  });
}

const tracer = new Tracer({
  recorder,
  ctxImpl // this would typically be a CLSContext or ExplicitContext
});

var os = require('os');
var app = express();

app.use(zipkinMiddleware({
  tracer,
  serviceName: 'bonjour' // name of this application
}));

function say_bonjour() {
  // Doing a plain roi GET on hola URL.
  // Useful to test with ab via terminal:
  // ab -n 10000 -c 100 http://bonjour-myproject.192.168.1.8.xip.io/api/bonjour
  // To see if it works 'oc log dc/bonjour'
  roi.get(chainingOptions)
    .then(x => console.log(x))
    .catch(e => console.log(e));
  return `Bonjour de ${os.hostname()}`;
}

app.get('/api/bonjour', function (req, resp) {
  resp.set('Access-Control-Allow-Origin', '*');
  resp.send(say_bonjour());
});

app.get('/api/bonjour-chaining', function(req, resp) {
  circuit.fire(chainingOptions).then((response) => {
    resp.set('Access-Control-Allow-Origin', '*');
    resp.send(response);
  }).catch((e) => resp.send(e));
});

app.get('/api/health', function(req, resp) {
  resp.set('Access-Control-Allow-Origin', '*');
  resp.send('I am ok');
});

var server = app.listen(8080, '0.0.0.0', function() {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Bonjour service running at http://%s:%s', host, port);
});
