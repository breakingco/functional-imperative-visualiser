'use strict';

function imperativeSum() {
  const arrayToSum = [3, 5, 5, 10];
  let sum = 0;
  var length = 2;
  //var result = Array(length);
  var index = -1,
    result = Array(length);

  function sumFunction(length) {
    result = Array(length)
    for (let i = 0; i < arrayToSum.length; i++) {
      sum += arrayToSum[i];
    }
  }

  sumFunction(4);
}

function functionalSum() {

  function reduce(array, iteratee, accumulator, initFromArray) {
    var index = -1,
      length = array.length;

    if (initFromArray && length) {
      accumulator = array[++index];
    }
    while (++index < length) {
      accumulator = iteratee(accumulator, array[index], index, array);
    }
    return accumulator;
  }

  function sumFunction(arrayToSum) {
    return reduce(arrayToSum, function(a, b) {
      return a + b;
    }, 0);
  }
  var numbers = [1, 1, 4, 6, 10, 50, 500];
  sumFunction(numbers);
}

function nestedReturn() {
  function foo(fooParamReceived) {
    function bar(receiveLiteral, receiveFunction) {
      return 'result';
    }

    function passToBar(receiveParentLiteral) {
      return 'blah';
    }
    return bar(arr, passToBar(arr));
  }

  function funcWithoutReturn() {}
  funcWithoutReturn();
  funcWithoutReturn();
  funcWithoutReturn();
  funcWithoutReturn();
  funcWithoutReturn();
  funcWithoutReturn();
  funcWithoutReturn();
  funcWithoutReturn();
  funcWithoutReturn();
  funcWithoutReturn();
  funcWithoutReturn();
  funcWithoutReturn();
  funcWithoutReturn();
  var arr = [0, 3]
  var result = foo(arr);
  /*  function foo(fooParamReceived) {

      function bar(receiveLiteral, receiveFunction) {
        return 'result';
      }

      function passToBar(receiveParentLiteral) {
        return 'blah'
      }

      return bar(fooParamReceived, passToBar(fooParamReceived));
    }

    function funcWithoutReturn() {}
    //funcWithoutReturn();
    //funcWithoutReturn();
    var result = foo('fooParamPassed');
  */
}

function varMutatedOutOfScope() {
  // this example demonstrates the effect of
  // mutating a variable that was not declared
  // in the same scope (no side effects allowed)
  // The node mutating and the node (scope) in which the
  // variable was initially declared are both highlighted.

  function foo() {
    bar = 'mutation';
  }

  var bar = 'declaration';
  foo();

}

function fibonacciRecursive() {
  function fibonacci(n) {
    if (n <= 2) {
      return 1;
    }
    return fibonacci(n - 1) + fibonacci(n - 2);
  }

  var result = fibonacci(10);
}

export default {
  imperativeSum, functionalSum, nestedReturn,
  fibonacciRecursive,
};