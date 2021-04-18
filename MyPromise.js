const PENDING = "pending";
const RESOLVED = "resolved";
const REJECTED = "rejected";
class MyPromise {
  constructor(executor) {
    this.state = PENDING; // 默认状态
    this.value = null; // 保存执行成功的值
    this.reason = null; // 保存执行失败的原因
    this.resolvedCallbacks = []; // 成功队列
    this.rejectedCallbacks = []; // 失败队列
    try {
      // 立即执行
      executor(this.resolve, this.reject);
    } catch (e) {
      this.reject(e);
    }
  }

  resolve = (value) => {
    if (value instanceof MyPromise) {
      // 递归解析, 直到 value 为普通值
      return value.then(this.resolve, this.reject);
    }
    // 目前这里只处理同步的问题
    if (this.state === PENDING) {
      this.state = RESOLVED;
      this.value = value;
      this.resolvedCallbacks.map((cb) => cb(this.value));
    }
  };
  reject = (reason) => {
    // 目前这里只处理同步的问题
    if (this.state === PENDING) {
      this.state = REJECTED;
      this.reason = reason;
      this.rejectedCallbacks.map((cb) => cb(this.reason));
    }
  };
  // resolve 静态方法
  static resolve(value) {
    // 转成常规方式
    return new MyPromise((resolve) => {
      queueMicrotask(() => {
        resolve(value);
      });
    });
  }

  // reject 静态方法
  static reject(reason) {
    return new MyPromise((resolve, reject) => {
      queueMicrotask(() => {
        reject(reason);
      });
    });
  }

  then = (onFulfilled, onRejected) => {
    const realOnFulfilled =
      typeof onFulfilled === "function" ? onFulfilled : (value) => value;
    const realOnRejected =
      typeof onRejected === "function"
        ? onRejected
        : (reason) => {
            throw reason;
          };

    // 为了链式调用这里直接创建一个 MyPromise，并在后面 return 出去
    const promise2 = new MyPromise((resolve, reject) => {
      const fulfilledMicrotask = () => {
        // 创建一个微任务等待 promise2 完成初始化
        queueMicrotask(() => {
          try {
            // 获取成功回调函数的执行结果
            const x = realOnFulfilled(this.value);
            // 传入 resolvePromise 集中处理
            resolvePromise(promise2, x, resolve, reject);
          } catch (error) {
            reject(error);
          }
        });
      };

      const rejectedMicrotask = () => {
        // 创建一个微任务等待 promise2 完成初始化
        queueMicrotask(() => {
          try {
            // 调用失败回调，并且把原因返回
            const x = realOnRejected(this.reason);
            // 传入 resolvePromise 集中处理
            resolvePromise(promise2, x, resolve, reject);
          } catch (error) {
            reject(error);
          }
        });
      };
      // 判断状态
      if (this.state === RESOLVED) {
        fulfilledMicrotask();
      } else if (this.state === REJECTED) {
        rejectedMicrotask();
      } else if (this.state === PENDING) {
        // 等待
        // 因为不知道后面状态的变化情况，所以将成功回调和失败回调存储起来
        // 等到执行成功失败函数的时候再传递
        this.resolvedCallbacks.push(fulfilledMicrotask);
        this.rejectedCallbacks.push(rejectedMicrotask);
      }
    });

    return promise2;
  };
  // 添加catch方法
  // catch 方法用来捕获执行过程中产生的错误，同时返回值为 promise,
  // 参数为一个失败回调函数，相对于执行 then(null, onRejected)
  catch = (onRejected) => {
    return this.then(null, onRejected);
  };
  /**
   * @description finally 的参数是一个回调函数，无论 promise 是执行成功，还是失败，该回调函数都会执行。
      应用场景有：页面异步请求数据，无论数据请求成功还是失败，在 finally 回调函数中都关闭 loading。

      同时，finally 方法有以下特点
      值穿透。可以将前面 promise 的值传递到下一个 then 方法中，或者将错误传递到下一个 catch 方法中等待执行。
      当 finally 回调函数返回一个新的 promise, finally 会等待该 promise 执行结束后才处理传值若该 promise 执行成功，
      finally 方法将不予理会执行结果，还是将上一个的结果传递到下一个 then 中若新的 promise 执行失败报错，
      finally 方法会将错误原因传递到下一个 catch 方法
   */
  finally = (callback) => {
    return this.then(
      (value) => {
        return Promise.resolve(callback()).then(() => value);
      },
      (err) => {
        return Promise.resolve(callback()).then(() => {
          throw err;
        });
      }
    );
  };
}

function resolvePromise(promise2, x, resolve, reject) {
  // 如果相等了，说明return的是自己，抛出类型错误并返回
  if (promise2 === x) {
    return reject(
      new TypeError("The promise and the return value are the same")
    );
  }

  if (typeof x === "object" || typeof x === "function") {
    // x 为 null 直接返回，走后面的逻辑会报错
    if (x === null) {
      return resolve(x);
    }

    let then;
    try {
      // 把 x.then 赋值给 then
      then = x.then;
    } catch (error) {
      // 如果取 x.then 的值时抛出错误 error ，则以 error 为据因拒绝 promise
      return reject(error);
    }

    // 如果 then 是函数
    if (typeof then === "function") {
      let called = false;
      try {
        then.call(
          x, // this 指向 x
          // 如果 resolvePromise 以值 y 为参数被调用，则运行 [[Resolve]](promise, y)
          (y) => {
            // 如果 resolvePromise 和 rejectPromise 均被调用，
            // 或者被同一参数调用了多次，则优先采用首次调用并忽略剩下的调用
            // 实现这条需要前面加一个变量 called
            if (called) return;
            called = true;
            resolvePromise(promise2, y, resolve, reject);
          },
          // 如果 rejectPromise 以据因 r 为参数被调用，则以据因 r 拒绝 promise
          (r) => {
            if (called) return;
            called = true;
            reject(r);
          }
        );
      } catch (error) {
        // 如果调用 then 方法抛出了异常 error：
        // 如果 resolvePromise 或 rejectPromise 已经被调用，直接返回
        if (called) return;
        called = true;
        // 否则以 error 为据因拒绝 promise
        reject(error);
      }
    } else {
      // 如果 then 不是函数，以 x 为参数执行 promise
      resolve(x);
    }
  } else {
    // 如果 x 不为对象或者函数，以 x 为参数执行 promise
    resolve(x);
  }
}

MyPromise.deferred = function () {
  var result = {};
  result.promise = new MyPromise(function (resolve, reject) {
    result.resolve = resolve;
    result.reject = reject;
  });

  return result;
};
module.exports = MyPromise;

// demo
MyPromise.resolve()
  .then(() => {
    console.log(0);
    return MyPromise.resolve(4);
  })
  .then((res) => {
    console.log(res);
  });

MyPromise.resolve()
  .then(() => {
    console.log(1);
  })
  .then(() => {
    console.log(2);
  })
  .then(() => {
    console.log(3);
  })
  .then(() => {
    console.log(5);
  })
  .then(() => {
    console.log(6);
  });
