"use strict";
var vm = require("vm");
var typeTranslation = {};
typeTranslation["int"] = "number";
typeTranslation["double"] = "number";
typeTranslation["float"] = "number";
typeTranslation["Int32"] = "number";
typeTranslation["Int64"] = "number";
typeTranslation["short"] = "number";
typeTranslation["long"] = "number";
typeTranslation["decimal"] = "number";
typeTranslation["bool"] = "boolean";
typeTranslation["DateTime"] = "string";
typeTranslation["Guid"] = "string";
typeTranslation["string"] = "string";
typeTranslation["JObject"] = "any";
typeTranslation["dynamic"] = "any";
typeTranslation["object"] = "any";
var blockCommentRegex = /\/\*([\s\S]*)\*\//gm;
var lineCommentRegex = /\/\/(.*)/g;
var typeRegex = /( *)(?:public\s*|partial\s*|abstract\s*)*\s*(class|enum|struct|interface)\s+([\w\d_<>, ]+?)(?:\s*:\s*((?:(?:[\w\d\._<>, ]+?)(?:,\s+)?)+))?\s*\{((?:.|\n|\r)+?^\1\})/gm;
function safeRegex(regex, input, options) {
    if (!input)
        return [];
    var sandbox = {
        results: [],
        regex: regex,
        result: null
    };
    var context = vm.createContext(sandbox);
    var sanitizedInput = input
        .replace(/[\n\r]+/gm, "\\n")
        .replace(/\'/g, "\\'");
    var scriptString = "while(result=regex.exec('" + sanitizedInput + "')){results.push(result);}";
    var script = new vm.Script(scriptString);
    try {
        var timeout = options && options.timeout;
        if (!timeout)
            timeout = 30000;
        script.runInContext(context, {
            timeout
        });
    }
    catch (e) {
        throw new Error("Regular expression timeout for pattern '" + regex + "' and data '" + input + "', with " + sandbox.results.length + " results gathered so far.\n\nInner error: " + e);
    }
    return sandbox.results;
}
function removeComments(code) {
    var output = code.replace(blockCommentRegex, "");
    var lines = output
        .split("\n")
        .map(function (line) { return line.replace(lineCommentRegex, ""); });
    return lines.join("\n");
}
function generateInterface(className, inherits, input, isInterface, options) {
    var propertyRegex = /(?:(?:((?:public)?)|(?:private)|(?:protected)|(?:internal)|(?:protected internal)) )+(?:(virtual|readonly) )?([\w\d\._<>, \[\]]+?)(\??) ([\w\d]+)\s*(?:{\s*get;\s*(?:private\s*)?set;\s*}|;)/gm;
    var methodRegex = /(?:(?:((?:public)?)|(?:private)|(?:protected)|(?:internal)|(?:protected internal)) )+(?:(virtual|readonly) )?(?:(async) )?(?:([\w\d\._<>, \[\]]+?) )?([\w\d]+)\(((?:.?\s?)*?)\)\s*/gm;
    var propertyNameResolver = options && options.propertyNameResolver;
    var methodNameResolver = options && options.methodNameResolver;
    var interfaceNameResolver = options && options.interfaceNameResolver;
    var originalClassName = className;
    if (inherits && interfaceNameResolver) {
        inherits = interfaceNameResolver(inherits);
    }
    if (interfaceNameResolver) {
        className = interfaceNameResolver(className);
    }
    if (options && options.prefixWithI) {
        if (inherits)
            inherits = "I" + inherits;
        className = "I" + className;
    }
    var ignoreInheritance = options && options.ignoreInheritance;
    if (inherits && ignoreInheritance !== true && (!ignoreInheritance || ignoreInheritance.indexOf(inherits) === -1)) {
        className += " extends " + inherits;
    }
    var definition = "interface " + className + " {\n";
    if (options && options.dateTimeToDate) {
        typeTranslation["DateTime"] = "Date";
        typeTranslation["System.DateTime"] = "Date";
    }
    else {
        typeTranslation["DateTime"] = "string";
        typeTranslation["System.DateTime"] = "string";
    }
    if (options && options.customTypeTranslations) {
        for (var key in options.customTypeTranslations) {
            if (options.customTypeTranslations.hasOwnProperty(key)) {
                typeTranslation[key] = options.customTypeTranslations[key];
            }
        }
    }
    var leadingWhitespace = "    ";
    var properties = [];
    for (var _i = 0, _a = safeRegex(propertyRegex, input, options); _i < _a.length; _i++) {
        var propertyResult = _a[_i];
        var visibility = propertyResult[1];
        if (!isInterface && visibility !== "public")
            continue;
        if (options && options.ignoreVirtual) {
            var isVirtual_1 = propertyResult[2] === "virtual";
            if (isVirtual_1) {
                continue;
            }
        }
        var varType = getVarType(propertyResult[3], "property-type", options);
        var isReadOnly = propertyResult[2] === "readonly";
        var isOptional = propertyResult[4] === "?";
        var propertyName = propertyResult[5];
        if (propertyNameResolver) {
            propertyName = propertyNameResolver(propertyName);
        }
        definition += leadingWhitespace;
        if (options && !options.stripReadOnly && isReadOnly) {
            definition += "readonly ";
        }
        definition += propertyName;
        if (isOptional) {
            definition += "?";
        }
        definition += ": " + varType + ";\n";
        properties.push({ name: propertyName, type: varType });
    }
    var methods = [];
    if (options && !options.ignoreMethods) {
        for (var _b = 0, _c = safeRegex(methodRegex, input, options); _b < _c.length; _b++) {
            var methodResult = _c[_b];
            var visibility_1 = methodResult[1];
            if (!isInterface && visibility_1 !== "public")
                continue;
            var varType_1 = getVarType(methodResult[4], "method-return-type", options);
            var isAsync = methodResult[3] === "async";
            if (isAsync) {
                if (varType_1.indexOf("<") > -1 && varType_1.indexOf(">") > -1) {
                    varType_1 = varType_1.replace(/^Task\<([^?\s]*)\>$/gm, "$1");
                    varType_1 = "Promise<" + varType_1 + ">";
                }
                else {
                    varType_1 = varType_1.replace("Task", "Promise<void>");
                }
            }
            if (options && options.ignoreVirtual) {
                var isVirtual = methodResult[2] === "virtual";
                if (isVirtual) {
                    continue;
                }
            }
            var methodName = methodResult[5];
            if (methodName.toLowerCase() === originalClassName.toLowerCase())
                continue;
            if (methodNameResolver) {
                methodName = methodNameResolver(methodName);
            }
            definition += leadingWhitespace + methodName + "(";
            var methodArguments = methodResult[6];
            var argumentsRegex = /\s*(?:\[[\w\d]+\])?([^?\s]*) ([\w\d]+)(?:\,\s*)?/gm;
            var argumentDefinition = "";
            for (var _d = 0, _e = safeRegex(argumentsRegex, methodArguments, options); _d < _e.length; _d++) {
                var argumentResult = _e[_d];
                if (argumentDefinition !== "") {
                    argumentDefinition += ", ";
                }
                argumentDefinition += argumentResult[2] + ": " + getVarType(argumentResult[1], "method-argument-type", options);
            }
            definition += argumentDefinition;
            definition += "): " + varType_1 + ";\n";
            methods.push({ name: methodName, returnType: varType_1 });
        }
    }
    if (options && options.additionalInterfaceCodeResolver) {
        var customCode = options.additionalInterfaceCodeResolver(leadingWhitespace, originalClassName, properties, methods);
        definition += "\n" + leadingWhitespace + customCode + "\n";
    }
    definition += "}\n";
    return definition;
}
function getVarType(typeCandidate, scope, options) {
    var collectionRegex = /^(I?List|IEnumerable|ICollection|HashSet)<([\w\d]+)>$/gm;
    var dictionaryRegex = /^I?Dictionary<([\w\d]+),\s?([\w\d]+)>$/gm;
    var genericPropertyRegex = /^([\w\d]+)<([\w\d\<\> ,]+)>$/gm;
    var arrayRegex = /^([\w\d]+)\[\]$/gm;
    var varType = typeTranslation[typeCandidate];
    if (varType) {
        if (scope && (options && options.typeResolver)) {
            varType = options.typeResolver(varType, scope);
        }
        return varType;
    }
    varType = typeCandidate;
    var collectionMatch = safeRegex(collectionRegex, varType, options)[0];
    var arrayMatch = safeRegex(arrayRegex, varType, options)[0];
    var genericPropertyMatch = safeRegex(genericPropertyRegex, varType, options)[0];
    var dictionaryMatch = safeRegex(dictionaryRegex, varType, options)[0];
    if (dictionaryMatch) {
        var type1 = dictionaryMatch[1];
        var type2 = dictionaryMatch[2];
        varType = "{ [index: " + getVarType(type1, null, options) + "]: " + getVarType(type2, null, options) + " }";
    }
    else if (collectionMatch) {
        var collectionContentType = collectionMatch[2];
        varType = getVarType(collectionContentType, null, options) + "[]";
    }
    else if (arrayMatch) {
        var arrayType = arrayMatch[1];
        varType = getVarType(arrayType) + "[]";
    }
    else if (genericPropertyMatch) {
        var generic = genericPropertyMatch[1];
        var genericTypes = genericPropertyMatch[2];
        var splits = genericTypes
            .split(",")
            .map(function (x) { return x.trim(); });
        var finalGenericType = "";
        for (var _i = 0, splits_1 = splits; _i < splits_1.length; _i++) {
            var split = splits_1[_i];
            if (finalGenericType !== "")
                finalGenericType += ", ";
            finalGenericType += getVarType(split, null, options);
        }
        varType = generic + "<" + finalGenericType + ">";
    }
    if (scope && (options && options.typeResolver)) {
        varType = options.typeResolver(varType, scope);
    }
    return varType;
}
function generateEnum(enumName, input, options) {
    var entryRegex = /(\w+)\s*=?\s*(-*\d+)?[,|\s]/gm;
    var definition;
    if (options.useStringUnionTypes) {
        definition = "type " + enumName + " =\n    ";
    }
    else {
        definition = "enum " + enumName + " {\n    ";
    }
    var elements = [];
    var lastIndex = 0;
    for (var _i = 0, _a = safeRegex(entryRegex, stripDecorators(input)); _i < _a.length; _i++) {
        var entryResult = _a[_i];
        var entryName = entryResult[1];
        var entryValue = entryResult[2];
        if (!entryValue) {
            entryValue = lastIndex;
            lastIndex++;
        }
        else {
            lastIndex = parseInt(entryValue, 10) + 1;
        }
        if (options.useStringUnionTypes) {
            elements.push("'" + entryName + "'");
        }
        else {
            elements.push(entryName + " = " + entryValue);
        }
    }
    if (options.useStringUnionTypes) {
        definition += elements.join(" |\n    ");
        definition += "\n";
    }
    else {
        definition += elements.join(",\n    ");
        definition += "\n}\n";
    }
    return definition;
}
function stripDecorators(input) {
    var decoratorsRegex = /\[\w+\(\s*(?:\w+\s*\=\s*)?"[A-Öa-ö\s]*"\s*\)\]/gm;
    return input.replace(decoratorsRegex, "");
}
module.exports = function (input, options) {
    input = removeComments(input);
    var result = "";
    if (!options) {
        options = {};
    }
    for (var _i = 0, _a = safeRegex(typeRegex, input, options); _i < _a.length; _i++) {
        var match = _a[_i];
        var type = match[2];
        var typeName = match[3];
        var inherits = match[4];
        if (result.length > 0) {
            result += "\n";
        }
        if (type === "class" || type === "struct" || (type === "interface" && options.includeInterfaces)) {
            result += generateInterface(typeName, inherits, match[5], type === "interface", options);
        }
        else if (type === "enum") {
            if (!options.baseNamespace) {
                result += "declare ";
            }
            result += generateEnum(typeName, match[5], options);
        }
    }
    if (options.baseNamespace) {
        var firstLine = void 0;
        if (options.definitionFile === false) {
            firstLine = "module " + options.baseNamespace + " {";
        }
        else {
            firstLine = "declare module " + options.baseNamespace + " {";
        }
        var lines = [firstLine];
        lines = lines.concat(result.split("\n").map(function (line) {
            return "    " + (/^(?:interface|enum|type)/.test(line) ? "export " + line : line);
        }));
        lines = lines.slice(0, lines.length - 1);
        lines = lines.concat("}");
        result = lines.join("\n");
    }
    return result;
};
